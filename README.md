# uk-map

A self-hosted OpenStreetMap vector basemap covering the UK, built by GitHub
Actions, stored in Cloudflare R2, and served through Cloudflare's CDN to
MapLibre GL clients. See [`plan.md`](plan.md) for the full implementation
plan and [`docs/decisions/`](docs/decisions/) for decision records.

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
