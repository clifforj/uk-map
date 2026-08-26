# 003 — Cloudflare account and domain

**Status:** Decided
**Date:** 2026-08-26
**Issue:** #3 (plan item 0.3)

## Context

The project needs a Cloudflare-managed domain to serve tiles through R2 +
Workers + CDN. An existing Cloudflare account and domain are being reused
rather than provisioning new ones.

Because this repo is public, the actual domain and tile hostname are kept
out of the repo. They're stored as the `TILE_HOSTNAME` GitHub Actions secret
instead of being written into README/workflow source. Anywhere the plan or
docs refer to a hostname, treat `tiles.example.com` as a stand-in for the
real value.

## Decision

- **Account:** existing Cloudflare account.
- **Domain:** existing domain, nameservers delegated to Cloudflare.
- **Tile hostname:** stored as the `TILE_HOSTNAME` repo secret (not
  committed).
- **Plan tier:** Free — the project's traffic and cache needs don't require
  a paid plan. Revisit if request volume or cache limits (see the resource
  ceilings table in issue 6.3) are hit.
- **Tiered Cache:** enabled — free on all plans, reduces origin pulls
  against R2 on cache misses.

## Consequences

- Workflows and later docs that need the hostname should read it from the
  `TILE_HOSTNAME` secret rather than hardcoding a value.
- Anyone reproducing this setup needs their own domain delegated to
  Cloudflare and their own `TILE_HOSTNAME` secret set.
