# UK Vector Tile Server — Implementation Plan

**Goal:** A self-hosted OpenStreetMap vector basemap covering the UK, built by GitHub Actions, stored in Cloudflare R2, and served through Cloudflare's CDN to MapLibre GL clients.

**Target cost:** £0–10/month at low-to-moderate traffic.

**Revision:** v2. Incorporates operational lessons from OpenFreeMap's public architecture — separated build from promotion, weekly default cadence, upload completion markers, abuse protection, and resource-ceiling documentation.

---

## Notes for the agent converting this to issues

- Each numbered item below (`1.1`, `1.2`, …) is intended to become **one GitHub issue**. Titles are written to be used verbatim.
- Phases map naturally to **milestones** or a project board column each.
- `Depends on` fields give you the ordering. Items within a phase can often run in parallel — parallelism is noted where it applies.
- Suggested labels are listed per issue.
- Code snippets are **starting points, not verified configuration**. Several tool flags and product limits need checking against current upstream docs during implementation — these are flagged inline with ⚠️. **Preserve those markers**; do not rewrite them as confident instructions.

### Do not merge these issues

Some items look redundant and are not. Keep them as separate issues:

| Keep separate | Why |
|---|---|
| **3.4** (validation gate) and **6.1** (post-promotion smoke test) | 3.4 tests the **staged** artefact in R2 before anything points at it. 6.1 tests the **live** endpoint through the Worker and CDN after promotion. Merging them collapses the staged/live split and removes the whole point of having a promotion step. |
| **3.2** (build + upload) and **3.5** (promotion) | These are intentionally two workflows. Merging them means a bad build goes live automatically at 02:00 with nobody watching. |
| **2.4** (measure cache behaviour) and **4.1** (deploy Worker) | 2.4 is an investigation whose result determines whether 4.1 is urgent or deferrable. Merging them presupposes the answer. |

If an issue's body seems to duplicate another, check this table before consolidating.

---

## Architecture summary

```
Geofabrik UK extract (2.1 GB .osm.pbf)
        │
        ▼
GitHub Actions (weekly)  ──  Planetiler  ──▶  uk-YYYYMMDD.pmtiles (~2–4 GB)
        │
        ▼
Cloudflare R2 bucket  ──  versioned object + .done marker      [STAGED]
        │
        │  ◀── separate, deliberate promotion step
        ▼
latest.json pointer updated                                     [LIVE]
        │
        ▼
Cloudflare Worker (Protomaps PMTiles)  ──  /{z}/{x}/{y}.mvt  ──▶  CDN edge cache
        │
        ▼
MapLibre GL client  +  fonts (glyph PBFs)  +  sprite sheet  +  style JSON
```

The staged/live split is deliberate. A build going live automatically is a build that can break the map at 02:00 with nobody watching.

---

## Terminology: "Protomaps" means four different things

This plan references Protomaps in several places and they are **independent components**, not a bundle. Choosing one does not commit you to the others.

| Name | What it is | Where it appears |
|---|---|---|
| **PMTiles** | The file format — a single archive with a built-in index, read over HTTP range requests. An open spec, not a product | Throughout; this is the output format |
| **go-pmtiles** | CLI for inspecting, extracting, converting and locally serving `.pmtiles` files | Issue 1.2 |
| **Serverless adapters** | Scripts for Cloudflare Workers, AWS Lambda etc. that translate `z/x/y` requests into range reads against object storage | Issue 4.1 |
| **Protomaps Basemap** | A tileset product: its own schema, styles and daily planet builds | Issue 0.1, as one of three schema options |

**The two that get confused: issue 0.1's schema choice and issue 4.1's Worker are unrelated decisions.** Planetiler writes PMTiles regardless of schema, and the Worker serves PMTiles regardless of what's inside them. Picking OpenMapTiles or Shortbread in 0.1 has no bearing on whether you deploy the Worker in 4.1 — running the OpenMapTiles schema behind the Protomaps Worker is a normal, well-trodden combination.

Licensing note: the PMTiles reference implementations are BSD 3-Clause, so unlike the schema decision in 0.1, there is no licence question attached to the format, the CLI or the Worker.

---

# Phase 0 — Decisions and accounts

## 0.1 Decide tile schema and confirm licensing

**Labels:** `decision`, `phase-0`
**Depends on:** nothing
**Effort:** S

### Context
Three viable schemas, each with different tooling, output size and licence terms. This affects every downstream issue, so settle it first.

### Tasks
- [ ] Evaluate **OpenMapTiles** — Planetiler's default profile, largest ecosystem of ready-made styles, largest output. This is what OpenFreeMap uses, unmodified
- [ ] Evaluate **Shortbread** — Geofabrik's schema, leaner output, fully open, fewer off-the-shelf styles
- [ ] Evaluate **Protomaps Basemap** — most compact, good default styling. Note this is the *tileset and schema*, a separate thing from the Protomaps Worker in issue 4.1; choosing a different schema here does not rule out using that Worker
- [ ] ⚠️ Confirm licence terms against the intended use. The OpenMapTiles *schema* is CC-BY — verify compatibility before committing
- [ ] Record the decision and rationale in `docs/decisions/001-tile-schema.md`

### Acceptance criteria
- Schema chosen and documented with rationale
- Licence compatibility explicitly confirmed in writing

---

## 0.2 Decide rebuild cadence

**Labels:** `decision`, `phase-0`, `cost`
**Depends on:** nothing (parallel with 0.1)
**Effort:** S

### Context
This looks trivial and isn't. Because archives are published under versioned filenames, **every rebuild invalidates the entire edge cache for the previous version.** Cache hit rate craters at each cutover, which costs both latency and money — your bill is driven by Workers requests and R2 Class B operations, both of which only occur on cache misses.

OpenFreeMap rebuilds the planet weekly and reports a 99.4% CDN cache rate. The weekly cadence is part of why that number is achievable.

OSM basemap data does not visibly change day to day. **The default should be weekly**, and nightly should require a stated reason.

### Tasks
- [ ] Establish the actual freshness requirement — what breaks if the map is up to 7 days stale?
- [ ] Choose a cadence (default: weekly)
- [ ] If nightly is genuinely needed, document the reason and accept the reduced cache warmth explicitly
- [ ] Record in `docs/decisions/002-rebuild-cadence.md`

### Acceptance criteria
- Cadence chosen with a stated freshness requirement behind it
- Cache-warmth trade-off acknowledged in the decision record
- Value feeds directly into issue 3.2's cron schedule

---

## 0.3 Set up Cloudflare account and domain

**Labels:** `infra`, `phase-0`
**Depends on:** nothing (parallel with 0.1, 0.2)
**Effort:** S

### Tasks
- [ ] Create or identify the Cloudflare account to use
- [ ] Add the domain (nameservers delegated)
- [ ] Decide the tile hostname, e.g. `tiles.example.com`
- [ ] Confirm and record the plan tier (Free is sufficient) — cache limits differ by tier
- [ ] Enable **Tiered Cache** (free on all plans, reduces origin pulls)

### Acceptance criteria
- Domain resolves through Cloudflare
- Hostname and plan tier documented in the repo README

---

# Phase 1 — Prove the build locally

> Do this before touching CI. Debugging Planetiler flags inside a GitHub Actions runner is far slower than debugging them on a laptop.

### Shortcut: unblock Phases 4 and 5 without waiting for Phase 1

The `pmtiles` CLI can pull a regional subset out of a remote archive, transferring only the bytes inside the bounding box:

```bash
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles uk.pmtiles \
  --bbox=-8.6,49.9,1.8,60.9 --download-threads=8
```

That gives a usable UK archive in minutes, which is enough to build and test the Worker, CORS, fonts, styling and the demo page while the Planetiler build is still being sorted out. It uses the Protomaps Basemap schema and their build cadence, so it is scaffolding rather than a destination — but it removes Phase 1 from the critical path for all the client-side work.

Anyone taking this route should confirm the throwaway archive is replaced before issue 5.1's styling decisions are finalised, since schema differences will change the style.

## 1.1 Build a UK PMTiles archive locally

**Labels:** `build`, `phase-1`
**Depends on:** 0.1
**Effort:** M

### Context
Establishes the baseline: does the build work, how long does it take, how large is the output. These numbers size everything downstream.

### Tasks
- [ ] Install Java 21+ and download the latest `planetiler.jar` release
- [ ] Run an initial build:

```bash
java -Xmx8g -jar planetiler.jar \
  --download --area=united-kingdom \
  --output=uk.pmtiles \
  --nodemap-type=array --nodemap-storage=mmap
```

- [ ] ⚠️ Verify flag names against the current Planetiler README — `--nodemap-type`, `--nodemap-storage` and `--storage` have changed across releases
- [ ] Record: wall-clock runtime, peak RAM, peak temp disk usage, final output size
- [ ] Repeat with the RAM-only strategy needed for CI and record the same metrics:

```bash
java -Xmx11g -jar planetiler.jar \
  --download --area=united-kingdom \
  --output=uk.pmtiles \
  --storage=ram --nodemap-type=sparsearray
```

### Acceptance criteria
- A `uk.pmtiles` file is produced
- Both strategies documented with measured runtime, RAM and disk figures
- Confirmed whether the RAM-only strategy fits within 16 GB — **this gates issue 3.2**

### Expected values (sanity-check, not targets)
Runtime 5–20 min depending on cores; output 2–4 GB; temp disk up to ~21 GB on the mmap strategy.

---

## 1.2 Validate the archive and view it locally

**Labels:** `build`, `phase-1`
**Depends on:** 1.1
**Effort:** S

### Tasks
- [ ] Install the `pmtiles` CLI
- [ ] Run `pmtiles show uk.pmtiles` — confirm bounds, min/max zoom and vector layer list
- [ ] Serve locally with `pmtiles serve .` and load in a MapLibre test page
- [ ] Spot-check coverage at central London, a Scottish Highland area, a Welsh coastal town, and Northern Ireland
- [ ] Confirm coastline and water polygons render — a common failure mode when source downloads fail silently

### Acceptance criteria
- Metadata output captured in the issue
- Screenshots from at least four locations attached
- No missing coastline or absent layers

### Note
The checks written here become the basis for the automated validation gate in issue 3.4. Write them down properly.

---

# Phase 2 — Storage

## 2.1 Create the R2 bucket

**Labels:** `infra`, `phase-2`
**Depends on:** 0.3
**Effort:** S

### Tasks
- [ ] Create an R2 bucket (suggested name: `uk-tiles`)
- [ ] Location hint: Western Europe
- [ ] Use **Standard** storage class, not Infrequent Access — IA doubles operation costs and this is read-heavy
- [ ] Document bucket name and S3-compatible endpoint in the README

### Acceptance criteria
- Bucket exists and is reachable via the S3 API from a local machine

---

## 2.2 Create scoped R2 credentials and add GitHub secrets

**Labels:** `infra`, `security`, `phase-2`
**Depends on:** 2.1
**Effort:** S

### Tasks
- [ ] Create an R2 API token scoped to **Object Read & Write on the single bucket only** — not account-wide
- [ ] Add repository secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- [ ] Verify no credential is committed anywhere in the repo
- [ ] Document the token's scope; add a calendar reminder for rotation

### Acceptance criteria
- Token is bucket-scoped, not account-scoped
- All four secrets present in repository settings
- A trivial test workflow can list bucket contents

---

## 2.3 Manual upload and custom domain

**Labels:** `infra`, `phase-2`
**Depends on:** 1.1, 2.1
**Effort:** S

### Context
Get a real file served over the real hostname before automating anything. This is what issue 2.4 measures against.

### Tasks
- [ ] Upload the locally-built archive with `rclone` or `aws s3 cp` against the R2 endpoint (`wrangler r2 object put` is awkward above ~300 MB — use multipart)
- [ ] Set headers on upload:
  ```
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/octet-stream
  ```
- [ ] Connect the custom domain (`tiles.example.com`) to the bucket
- [ ] Confirm retrievable over HTTPS

### Acceptance criteria
- `curl -I https://tiles.example.com/uk-YYYYMMDD.pmtiles` returns 200 with expected headers
- A range request returns 206 Partial Content

---

## 2.4 Measure baseline cache behaviour

**Labels:** `infra`, `investigation`, `phase-2`
**Depends on:** 2.3
**Effort:** S

### Context
Cloudflare's default cache eligibility is driven by file extension, and `.pmtiles` is not on the default list. Separately there is a **512 MB maximum cacheable object size** on Free, Pro and Business plans, and the archive is well over that. This issue establishes which — if either — is actually biting, before any fix is applied.

⚠️ Verify the 512 MB figure against current Cloudflare docs; plan limits change.

### Tasks
- [ ] Measure cache status cold, then on a repeated range request:
  ```bash
  curl -sI -H "Range: bytes=0-16383" https://tiles.example.com/uk-YYYYMMDD.pmtiles \
    | grep -i -E 'cf-cache-status|content-range|age'
  ```
- [ ] Record the result: `HIT`/`MISS` (caching works), `DYNAMIC` (never attempted), `BYPASS` (explicitly excluded)
- [ ] If `DYNAMIC`, add a **Cache Rule** matching the path with "Eligible for cache" and an edge TTL, then re-measure
- [ ] Record cold vs warm latency
- [ ] Write findings into the issue — this determines how urgent 4.1 is

### Acceptance criteria
- Cache status documented cold and warm
- Latency delta measured
- Clear recommendation recorded: Worker required, or custom domain sufficient

---

# Phase 3 — CI build pipeline

## 3.1 Repository scaffold

**Labels:** `build`, `phase-3`
**Depends on:** nothing (parallel with Phase 2)
**Effort:** S

### Tasks
- [ ] Create the repository — **public if possible**. Public repos get 4 vCPU / 16 GB runners; private repos get 2 vCPU / 8 GB, which will not fit the RAM-only build strategy
- [ ] Add `README.md` documenting architecture, hostname, bucket and schema decision
- [ ] Add `docs/decisions/` for ADRs
- [ ] Add `.gitignore` covering `*.pmtiles`, `*.osm.pbf`, `data/`

### Acceptance criteria
- Repo exists with README and structure
- Visibility decision recorded with the runner-size rationale

---

## 3.2 Build workflow

**Labels:** `build`, `ci`, `phase-3`
**Depends on:** 1.1, 3.1
**Effort:** M

### Context
Uses whichever strategy issue 1.1 proved viable. The RAM strategy is preferred because it sidesteps the runner's 14 GB disk limit entirely.

**This workflow builds and uploads. It does not make anything live** — promotion is issue 3.5.

### Tasks
- [ ] Create `.github/workflows/build-tiles.yml`
- [ ] Set the cron from the cadence decided in issue 0.2

```yaml
name: Build UK tiles

on:
  schedule:
    - cron: '0 2 * * 3'   # Weekly, Wednesday 02:00 UTC — see ADR 002
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'

      # Only needed if using the mmap/disk strategy instead of RAM
      # - uses: jlumbroso/free-disk-space@main
      #   with:
      #     tool-cache: true

      - name: Download Planetiler
        run: |
          curl -sSL -o planetiler.jar \
            https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar

      - name: Build PMTiles
        run: |
          java -Xmx11g -jar planetiler.jar \
            --download --area=united-kingdom \
            --output=uk.pmtiles \
            --storage=ram --nodemap-type=sparsearray

      - name: Report output size
        run: ls -lh uk.pmtiles
```

- [ ] Add a size sanity check that fails the job if output is implausibly small (e.g. under 1 GB) — catches silent source-download failures
- [ ] Record actual runtime on the runner

### Acceptance criteria
- Workflow completes on `workflow_dispatch`
- Output size within the range established in 1.1
- Runtime recorded; job stays well inside the 6-hour limit
- Workflow does **not** touch `latest.json`

### Fallback if the RAM strategy OOMs
Switch to the disk strategy, uncomment `free-disk-space`, use `--nodemap-storage=mmap`. If neither fits, escalate to a larger runner (8-core Linux ≈ $0.032/min) or a self-hosted runner on a cheap VM.

---

## 3.3 Versioned upload with completion marker

**Labels:** `build`, `ci`, `phase-3`
**Depends on:** 2.2, 3.2
**Effort:** M

### Context
Versioned filenames mean cache is never purged and rollback is trivial. The completion marker matters because a release is more than one object — archive, fonts, sprites, style — and S3 multipart atomicity only covers a single object. A separate `.done` marker written last lets every downstream consumer verify the whole set landed.

### Tasks
- [ ] Add an upload step using `rclone` (handles multipart for multi-GB files reliably)
- [ ] Name the object `uk-$(date +%Y%m%d).pmtiles`
- [ ] Set `Cache-Control: public, max-age=31536000, immutable`
- [ ] After all uploads succeed, write `uk-$(date +%Y%m%d).done` containing build metadata (git SHA, Planetiler version, source extract date, output size)
- [ ] Nothing downstream may act on a version without its `.done` marker present

```yaml
      - name: Upload to R2
        env:
          RCLONE_CONFIG_R2_TYPE: s3
          RCLONE_CONFIG_R2_PROVIDER: Cloudflare
          RCLONE_CONFIG_R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          RCLONE_CONFIG_R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
        run: |
          VERSION=$(date +%Y%m%d)
          curl -sSL https://rclone.org/install.sh | sudo bash
          rclone copyto uk.pmtiles "r2:${{ secrets.R2_BUCKET }}/uk-${VERSION}.pmtiles" \
            --header-upload "Cache-Control: public, max-age=31536000, immutable" \
            --s3-chunk-size 64M --progress
          # .done marker written last, only on success
          echo "{\"version\":\"${VERSION}\",\"sha\":\"${GITHUB_SHA}\"}" > done.json
          rclone copyto done.json "r2:${{ secrets.R2_BUCKET }}/uk-${VERSION}.done"
```

### Acceptance criteria
- Object appears with correct name and headers
- `.done` marker written only after a successful archive upload
- Upload failure fails the job — no silent success and no orphan marker

---

## 3.4 Validation gate for staged builds

**Labels:** `build`, `ci`, `phase-3`
**Depends on:** 3.3
**Effort:** M

### Context
Validates a **staged** archive before anyone considers promoting it. Distinct from issue 6.1, which smoke-tests the live endpoint after promotion.

Automates the manual checks from issue 1.2.

### Tasks
- [ ] Add a job running after upload, against the staged (not live) object
- [ ] Assert the `.done` marker exists
- [ ] Assert output size is within an expected band relative to the previous version — flag a swing over ~20% either way, which usually means a truncated source download or a schema change
- [ ] Fetch known tiles across zooms and regions directly from the staged archive; assert valid non-empty MVT
- [ ] Verify metadata: bounds, min/max zoom, expected layer list
- [ ] Report results in the workflow summary

### Acceptance criteria
- A deliberately corrupted build fails the gate
- Results visible without opening logs
- Gate does not itself promote anything

---

## 3.5 Promotion workflow

**Labels:** `build`, `ci`, `ops`, `phase-3`
**Depends on:** 3.4
**Effort:** M

### Context
Promotion is a **separate workflow** from the build. This gives a bake period between artefact existing and artefact being live, makes going live a deliberate act, and makes rollback a normal operation rather than hand-editing JSON during an incident.

OpenFreeMap generates the planet on Wednesday and runs its set-latest step on Saturday. The gap is the point.

### Tasks
- [ ] Create `.github/workflows/promote.yml` with `workflow_dispatch` taking a version argument
- [ ] Refuse to promote a version lacking a `.done` marker
- [ ] Refuse to promote a version that failed the 3.4 gate
- [ ] Write `latest.json`:
  ```json
  { "version": "20260826", "url": "https://tiles.example.com/uk-20260826.pmtiles" }
  ```
- [ ] Set a **short** TTL on the pointer (`max-age=300`) — this is the one file that must not be cached aggressively
- [ ] Optionally add a scheduled auto-promote on a lag (e.g. promote the newest passing build every Saturday), but keep manual dispatch working
- [ ] Log every promotion with version, actor and timestamp

### Acceptance criteria
- Promotion succeeds only for validated versions with a `.done` marker
- Pointer TTL verified short via `curl -I`
- **Rollback tested end-to-end**: promote the previous version, confirm clients pick it up within the TTL

---

## 3.6 Retention and cleanup

**Labels:** `build`, `ci`, `cost`, `phase-3`
**Depends on:** 3.3
**Effort:** S

### Context
R2's free storage tier is 10 GB/month; each build is 2–4 GB. At weekly cadence, 3–4 retained versions is a comfortable fit.

### Tasks
- [ ] Decide retention (suggested: last 4 builds at weekly cadence, giving a month of rollback targets)
- [ ] Add a cleanup step deleting objects and markers older than the window
- [ ] **Never delete the version referenced by `latest.json`**, regardless of age
- [ ] Never delete the version immediately preceding the live one — that's your rollback target
- [ ] Consider an R2 lifecycle rule as an alternative, but note it cannot know which version is live

### Acceptance criteria
- Bucket stabilises at the expected object count
- Live and previous versions provably protected from deletion

---

## 3.7 Build and promotion notifications

**Labels:** `ci`, `ops`, `phase-3`
**Depends on:** 3.2, 3.5
**Effort:** S

### Tasks
- [ ] Notify on build failure and on validation-gate failure
- [ ] Notify on every promotion — going live should be visible
- [ ] Include the failing step and a run link
- [ ] Confirm scheduled-workflow failures actually notify — GitHub's defaults for `schedule` triggers are easy to miss

### Acceptance criteria
- A deliberately failed run produces a notification within minutes
- Promotions appear in the chosen channel

---

# Phase 4 — Serving layer

## 4.1 Deploy the Protomaps PMTiles Worker

**Labels:** `infra`, `phase-4`
**Depends on:** 2.1, 2.4
**Effort:** M

### Context
Translates `/{z}/{x}/{y}.mvt` into range reads against R2 and caches individual tiles at the edge. Tiles are tens of KB, well under any object size limit, so this sidesteps the 512 MB question and gives far better cache granularity.

**Schema-agnostic.** The Worker serves any PMTiles archive regardless of what schema is inside it. Whatever was decided in issue 0.1 has no bearing on this issue.

⚠️ Check current Protomaps Worker deployment docs — binding names and config format have changed across versions. The details below reflect the docs at time of writing.

### Tasks
- [ ] Deploy the Worker from the `serverless/cloudflare` directory of the `protomaps/PMTiles` repository, either via `wrangler` from a clone or by pasting the bundled `dist/index.js` into the dashboard editor
- [ ] Add an R2 bucket binding named `BUCKET` pointing at the bucket from issue 2.1
- [ ] Set the `ALLOWED_ORIGINS` variable — **this is where CORS is configured, not in R2's bucket settings.** Coordinate with issue 4.2 rather than setting it to `*` and forgetting
- [ ] Route at `tiles.example.com/*`
- [ ] Verify TileJSON is served by requesting `/TILESET.json` before testing individual tiles — this isolates Worker/binding problems from tile-level ones
- [ ] Confirm the Workers free tier (100k requests/day) is adequate; if not, budget $5/month plus $0.30/million

### Acceptance criteria
- `/TILESET.json` returns valid TileJSON
- `curl https://tiles.example.com/uk/14/8188/5443.mvt` returns valid MVT
- Repeated request shows `cf-cache-status: HIT`
- Edge tile latency under ~50 ms

### Skip condition
If issue 2.4 showed acceptable cache behaviour on the plain custom domain, this can be deferred — but record the decision and the latency being accepted.

---

## 4.2 CORS configuration

**Labels:** `infra`, `phase-4`
**Depends on:** 4.1
**Effort:** S

### Context
Missing CORS headers cause MapLibre to fail silently — map loads, no tiles, no obvious error. Very commonly the cause of a first-deploy "it doesn't work".

If the Worker from 4.1 is deployed, CORS is configured through its `ALLOWED_ORIGINS` variable rather than on the R2 bucket. If the Worker was skipped, it's configured on the bucket instead. Check which path applies before starting.

### Tasks
- [ ] Set allowed origins to the domains that will embed the map
- [ ] Avoid `*` if the audience is known
- [ ] Ensure `Access-Control-Allow-Headers` permits `Range`
- [ ] Verify preflight `OPTIONS` handling
- [ ] Confirm the same policy covers the `/fonts/` and `/sprites/` paths from issue 4.4, which may not route through the Worker

### Acceptance criteria
- A page on a different origin loads tiles successfully
- No CORS errors in the browser console

---

## 4.3 Abuse protection and request caps

**Labels:** `infra`, `cost`, `phase-4`
**Depends on:** 4.1
**Effort:** S

### Context
Public tile endpoints get discovered and used by people you didn't invite. OpenFreeMap's largest incident came from a single site that grew to 2 million users in days and generated 3 billion requests in 24 hours.

Your cost driver is Workers requests, which bill on **every** hit including cache hits. Without a cap, your downside is unbounded. This is twenty minutes of work.

### Tasks
- [ ] Add a Cloudflare rate-limiting rule on the tile path — per-IP, sized generously enough not to break legitimate heavy panning
- [ ] Consider a Referer allowlist if the consuming domains are known and fixed
- [ ] Set a Workers daily request alarm well below the point where cost becomes uncomfortable
- [ ] Document what a legitimate heavy user looks like versus scraping, so rules can be tuned rather than guessed at
- [ ] Decide and document the response if a third party starts using the endpoint at volume

### Acceptance criteria
- Rate-limiting rule active and verified not to trip during normal use
- Alerting configured on request volume
- Documented worst-case monthly cost with caps in place

---

## 4.4 Host fonts and sprites

**Labels:** `infra`, `phase-4`
**Depends on:** 2.1
**Effort:** M

### Context
Easy to forget and it blocks all rendering. MapLibre needs glyph PBFs for text and a sprite sheet for icons; neither lives inside the PMTiles archive.

### Tasks
- [ ] Obtain glyph PBFs for the fonts the chosen style requires (Protomaps and OpenMapTiles both publish prebuilt font assets)
- [ ] Trim to only the Unicode ranges needed — a full Noto set is several hundred MB, a trimmed set far smaller
- [ ] Obtain or generate the sprite sheet (`.png` + `.json`, plus `@2x` variants)
- [ ] Upload both to R2 under `/fonts/` and `/sprites/`
- [ ] Set long cache headers — these change rarely
- [ ] Verify CORS applies to these paths too

### Acceptance criteria
- Glyph and sprite URLs return 200 with correct content types
- Labels and icons render in the test client

---

# Phase 5 — Client

## 5.1 MapLibre style

**Labels:** `client`, `phase-5`
**Depends on:** 0.1, 4.1, 4.4
**Effort:** **M–L** — see context

### Context
Do not under-size this. Getting a stock style loading is an afternoon; getting a map that looks like *yours* rather than a demo is where the calendar time actually goes. OpenFreeMap runs the OpenMapTiles schema unmodified but describes its styles as forked and heavily modified — that's the normal trajectory.

The work is label density, road hierarchy, colour palette, and zoom-level thresholds. Expect iteration.

### Tasks
- [ ] Start from a published style matching the chosen schema (Positron / Dark Matter / OSM Bright for OpenMapTiles; Protomaps or Versatiles styles otherwise)
- [ ] Fork it into the repo — treat it as owned source, not a dependency
- [ ] Point `sources` at the tile endpoint, `glyphs` at the font path, `sprite` at the sprite path
- [ ] Set `maxzoom: 14` on the source so MapLibre overzooms correctly above z14
- [ ] Review label density at z10–14 in dense urban areas — the most common thing that looks wrong
- [ ] Serve the style from R2 alongside everything else

### Acceptance criteria
- Style loads without console errors
- Overzoom above z14 works — no blank tiles at z15–19
- Reviewed by someone other than the implementer for legibility at each zoom band

---

## 5.2 Demo page

**Labels:** `client`, `phase-5`
**Depends on:** 5.1
**Effort:** S

### Tasks
- [ ] Minimal HTML page loading MapLibre GL JS with the style
- [ ] Read the archive version from `latest.json` rather than hardcoding it
- [ ] Deploy somewhere reachable (GitHub Pages is fine for a demo page — just not for the tiles themselves)

### Acceptance criteria
- Map loads, pans and zooms smoothly across the UK
- Picks up promoted versions without a code change

---

## 5.3 Attribution

**Labels:** `client`, `legal`, `phase-5`
**Depends on:** 5.1
**Effort:** S

### Context
**A licence obligation, not a nicety.** OSM data is ODbL and requires attribution. Do not ship without it.

### Tasks
- [ ] Add `© OpenStreetMap contributors` to the map control
- [ ] Include the schema's own attribution requirements if applicable (e.g. CC-BY for OpenMapTiles)
- [ ] Verify attribution is visible by default, not hidden behind an interaction
- [ ] Review against the OSMF attribution guidelines

### Acceptance criteria
- Attribution visible on initial load
- Reviewed against ODbL requirements, outcome noted in the issue

---

# Phase 6 — Operations

## 6.1 Post-promotion smoke test

**Labels:** `ci`, `ops`, `phase-6`
**Depends on:** 3.5, 4.1
**Effort:** M

### Context
Tests the **live** endpoint after promotion. Issue 3.4 tests the staged artefact; this tests that promotion actually took effect end to end, through the Worker and the CDN.

### Tasks
- [ ] Run automatically after every successful promotion
- [ ] Fetch known tiles across zooms and regions from the live hostname; assert valid non-empty MVT
- [ ] Assert `latest.json` matches the version just promoted
- [ ] Assert fonts, sprites and style all return 200
- [ ] Fail loudly and notify on any failure, with the rollback command in the alert text

### Acceptance criteria
- Runs automatically after every promotion
- A deliberately broken promotion is caught
- Alert includes the rollback instruction

---

## 6.2 Cost monitoring

**Labels:** `ops`, `cost`, `phase-6`
**Depends on:** 4.1, 4.3
**Effort:** S

### Context
Egress is free on R2, so the bill is **Class B operations** ($0.36/million above a 10M/month free allowance) and **Workers requests** ($0.30/million above the free tier). At volume, Workers requests dominate — they bill even on cache hits.

### Tasks
- [ ] Set a Cloudflare billing alert
- [ ] Record baseline monthly Class B operations, Workers requests and storage after two weeks of live traffic
- [ ] **Measure cache hit rate before and after a promotion** — this quantifies the cadence trade-off from issue 0.2 with real numbers rather than estimates
- [ ] Document actual cost against the £0–10/month estimate
- [ ] Revisit the cadence decision if the post-promotion cache-warming cost turns out to be material

### Acceptance criteria
- Billing alert configured
- Two weeks of baseline figures recorded
- Cache hit rate impact of a promotion measured and recorded

---

## 6.3 Runbook

**Labels:** `docs`, `ops`, `phase-6`
**Depends on:** 3.5, 4.1
**Effort:** M

### Context
Include a section on **resource ceilings**. The failure that took OpenFreeMap down under load was nginx hitting "too many open files" — an OS limit nobody had capacity-planned for. Your equivalents are platform limits that don't appear in normal sizing: Workers daily request caps, Cloudflare plan cache limits, R2 rate limits, GitHub Actions minute allowances. Write down what your ceilings are and what hitting each one looks like from the outside.

### Tasks
- [ ] How to roll back: run the promote workflow against the previous version
- [ ] How to trigger a manual rebuild
- [ ] How to promote a specific version
- [ ] What to check when tiles stop loading — CORS, Worker errors, pointer/version mismatch, expired credentials, rate limit tripped
- [ ] How to rotate R2 credentials
- [ ] **Resource ceilings table**: every platform limit, its current value, and the observable symptom when hit
- [ ] Known limitations: no near-real-time updates, z14 max with client overzoom, no raster output

### Acceptance criteria
- Committed to `docs/runbook.md`
- Someone other than the implementer can follow the rollback procedure unaided
- Ceilings table complete with symptoms, not just numbers

---

## 6.4 Load and device testing

**Labels:** `ops`, `client`, `phase-6`
**Depends on:** 5.2
**Effort:** M

### Context
Vector tiles push rendering onto the client. Older Android devices and locked-down corporate browsers are where this shows, and it won't be visible on the developer's laptop.

### Tasks
- [ ] Test on a low-end Android device
- [ ] Test on Safari (iOS and macOS)
- [ ] Test on a throttled mobile connection
- [ ] Measure time-to-first-paint and bytes transferred for a representative session
- [ ] Record whether any client segment needs a raster fallback

### Acceptance criteria
- Results recorded for at least three device/browser combinations
- Explicit decision on whether a raster fallback is required

---

# Reference figures

| Item | Value | Source |
|---|---|---|
| UK OSM extract | 2.1 GB `.osm.pbf` | Geofabrik |
| Expected PMTiles output | 2–4 GB (z0–14) | estimate, confirm in 1.1 |
| Planetiler disk requirement | ~10× PBF size | Planetiler docs |
| Planetiler RAM requirement | ~0.5× PBF size minimum | Planetiler docs |
| Build runtime | 5–20 min | estimate, confirm in 1.1 |
| GH runner (public repo) | 4 vCPU, 16 GB RAM, 14 GB SSD | GitHub docs |
| GH runner (private repo) | 2 vCPU, 8 GB RAM, 14 GB SSD | GitHub docs |
| R2 storage | $0.015/GB-month | Cloudflare |
| R2 Class A (writes) | $4.50/million | Cloudflare |
| R2 Class B (reads) | $0.36/million | Cloudflare |
| R2 free tier | 10 GB + 1M Class A + 10M Class B/month | Cloudflare |
| R2 egress | $0 | Cloudflare |
| Workers free tier | 100k requests/day | Cloudflare |
| CF max cacheable object (Free/Pro/Business) | 512 MB | ⚠️ verify current |

---

# Critical path

```
0.1 ─┬─▶ 1.1 ─▶ 1.2
0.2 ─┤    │
0.3 ─┴─▶ 2.1 ─┬──▶ 2.3 ─▶ 2.4 ─▶ 4.1 ─┬─▶ 4.2 ─▶ 5.1 ─▶ 5.2 ─▶ 5.3
              │                        ├─▶ 4.3
              └─▶ 2.2 ─▶ 3.3 ─▶ 3.4 ─▶ 3.5 ─▶ 6.1
                    ▲                   │
       3.1 ─▶ 3.2 ──┘                   └─▶ 6.2, 6.3

       4.4 ─▶ 5.1
```

**Minimum viable path to a working map:** 0.1 → 1.1 → 2.1 → 2.3 → 4.4 → 5.1 → 5.2 → 5.3

Everything else is automation, cost control and operational maturity, and can follow.

---

# Open questions to resolve during implementation

1. **Repo visibility** — public gives 16 GB runners and free minutes. If it must be private, issue 3.2 needs the disk-based strategy and possibly a larger runner.
2. **Promotion policy** — fully manual, or auto-promote on a lag? Manual is safer to start; automate once the validation gate has earned trust.
3. **Traffic estimate** — drives whether the Workers free tier suffices. Worth pinning down before issue 4.1.
4. **Third-party usage** — is the endpoint public, or locked to known domains? Affects issue 4.3.
5. **Raster fallback** — needed if anything downstream generates PDFs, emails or static images. Decide by issue 6.4 at the latest.
