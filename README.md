# uk-map

A self-hosted OpenStreetMap vector basemap covering the UK, built by GitHub
Actions, stored in Cloudflare R2, and served through Cloudflare's CDN to
MapLibre GL clients. See [`plan.md`](plan.md) for the full implementation
plan and [`docs/decisions/`](docs/decisions/) for decision records.

## Repository visibility

This repo is **public**, deliberately: GitHub Actions gives public repos
4 vCPU / 16 GB runners, versus 2 vCPU / 8 GB for private ones. The RAM-only
build strategy (see `plan.md`) needs the larger runner, so public was a
requirement, not just a default. Anything that shouldn't be public (the tile
hostname, R2 account ID) is kept out of the repo and stored as GitHub Actions
secrets instead — see below.

## Working on this repo

This project is small enough right now that branches and PRs are unnecessary
overhead: commit directly to `main`. Revisit this once there's more than one
regular contributor or the project needs a review gate before changes land.

## Cloudflare setup

Tiles are served from a Cloudflare-managed domain. The actual hostname isn't
committed to this (public) repo — it's stored as the `TILE_HOSTNAME` GitHub
Actions secret and referenced by name (e.g. `tiles.example.com`) below and in
workflows.

- **Account:** existing Cloudflare account, domain already delegated
  (nameservers pointed at Cloudflare).
- **Plan tier:** Free — sufficient for this project; see
  [`docs/decisions/003-cloudflare-domain.md`](docs/decisions/003-cloudflare-domain.md).
- **Tile hostname:** see the `TILE_HOSTNAME` repo secret.
- **Tiered Cache:** enabled (Caching → Tiered Cache in the Cloudflare
  dashboard) — free on all plans, reduces origin pulls on R2.

## R2 storage

- **Bucket:** `uk-tiles`, Standard storage class, Western Europe location
  hint.
- **S3-compatible endpoint:** `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/uk-tiles`
  — the account ID isn't committed to this (public) repo; it's stored as the
  `R2_ACCOUNT_ID` GitHub Actions secret.
- Verified reachable via the S3 API (`aws s3 ls`) from a local machine using
  an R2 API token scoped to this bucket.
- **CI credentials:** a dedicated R2 API token (created via R2 → Manage R2
  API Tokens, not a general account/user API token) scoped to **Object Read
  & Write on the `uk-tiles` bucket only**. Stored as GitHub Actions secrets
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
  Verified via the `R2 smoke test` workflow
  (`.github/workflows/r2-smoke-test.yml`), which lists the bucket contents.
- **Rotation:** rotate this token roughly every 12 months, or immediately if
  it's ever exposed (e.g. pasted somewhere outside a secrets store). To
  rotate: create a new bucket-scoped token in the Cloudflare dashboard,
  update the four `R2_*` GitHub secrets, confirm the smoke test workflow
  still passes, then revoke the old token.

### Layout

- `/fonts/<fontstack>/<unicode-range>.pbf` — glyph PBFs. Currently
  `noto_sans_regular` and `noto_sans_bold` (from
  [versatiles-org/versatiles-fonts](https://github.com/versatiles-org/versatiles-fonts)),
  trimmed to the Latin/Cyrillic/Greek/punctuation ranges this map needs
  rather than the full multi-script set.
- `/sprites/<set>/sprites[@2x|@3x|@4x].{png,json}` — sprite sheets from
  [versatiles-org/versatiles-style](https://github.com/versatiles-org/versatiles-style)
  (`basics` and `markers` sets). `basics` is what the shortlisted
  Colorful/Neutrino styles reference by default.
- Both were uploaded with a one-year immutable cache-control header, via a
  one-off `workflow_dispatch` run (same pattern as the archive upload in
  issue 2.3) that was deleted once it completed.
