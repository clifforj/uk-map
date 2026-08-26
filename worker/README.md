# pmtiles-uk-tiles Worker

The Cloudflare Worker that serves tiles, fonts, sprites and `latest.json`
from the `uk-tiles` R2 bucket at the tile hostname (issue 4.1).

`src/index.ts` and `shared/` are vendored from
[`protomaps/PMTiles`](https://github.com/protomaps/PMTiles)'s
`serverless/cloudflare` and `serverless/shared` (BSD-3-Clause, see
`LICENSE`), with one addition on top of upstream: a passthrough branch for
plain R2 objects that aren't PMTiles archives — `fonts/`, `sprites/` (issue
4.4) and `latest.json` (issue 5.2) — served directly from R2 instead of
being misrouted into the PMTiles tile/tileset reader, which otherwise 404s
on them with a misleading "Archive not found".

This is vendored (not a submodule or subtree) because it's small, gets
hand-edited in place, and doesn't need to track upstream — same rationale
as forking `client/style.json` in issue 5.1.

## Deploying

```sh
cd worker
npm install --legacy-peer-deps  # wrangler's peer-optional workers-types range trails npm's resolution; harmless
cp wrangler.toml.example wrangler.toml
# edit wrangler.toml: substitute __TILE_HOSTNAME__ with the real hostname
# (the TILE_HOSTNAME repo secret's value — see docs/decisions/003-cloudflare-domain.md)
npx wrangler login   # once, if not already authenticated
npm run deploy
```

`wrangler.toml` is gitignored — it's the one place the real tile hostname
has to exist outside GitHub Actions secrets, since `wrangler` needs it
locally to attach the custom-domain route. Never commit it.

This repo doesn't run Worker deploys from CI — `wrangler deploy` needs a
Cloudflare API token scoped far more broadly than the R2-only credentials
already in GitHub secrets (see README.md's R2 storage section), and Worker
changes are infrequent enough that a deliberate local deploy is fine.

## Testing

```sh
npm test        # unit tests for shared/ (pmtiles_path, tile_path)
npm run typecheck
```
