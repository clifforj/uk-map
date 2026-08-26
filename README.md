# uk-map

A self-hosted OpenStreetMap vector basemap covering the UK, built by GitHub
Actions, stored in Cloudflare R2, and served through Cloudflare's CDN to
MapLibre GL clients. See [`plan.md`](plan.md) for the full implementation
plan and [`docs/decisions/`](docs/decisions/) for decision records.

## Working on this repo

This project is small enough right now that branches and PRs are unnecessary
overhead: commit directly to `main`. Revisit this once there's more than one
regular contributor or the project needs a review gate before changes land.
