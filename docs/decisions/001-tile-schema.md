# 001 — Tile schema: OpenMapTiles

**Status:** Decided
**Date:** 2026-08-26
**Issue:** #1 (plan item 0.1)

## Context

Planetiler can build against three viable vector tile schemas, each with different
tooling maturity, output size, and licence terms. This is a foundational decision:
it shapes the Planetiler build profile, which pre-built styles are available for
issue 5.1, and what attribution obligations apply on top of the OSM/ODbL
requirement that exists regardless of schema (issue 5.3).

## Options considered

### OpenMapTiles
- Planetiler's **default** build profile — no custom profile code needed to get
  a first build.
- Largest ecosystem of ready-made, actively maintained styles (Positron, Dark
  Matter, OSM Bright, Klokantech Basic) — directly usable as the starting point
  for issue 5.1.
- This is what OpenFreeMap runs unmodified, at UK-relevant scale — the closest
  available reference for "will this actually hold up in production."
- Largest output size of the three options.
- Licence: code (Planetiler profile, tooling) is BSD. The schema/cartography
  design itself — layer and attribute choices — is CC-BY 4.0, requiring visible
  attribution to OpenMapTiles.org. Source: [openmaptiles/openmaptiles
  LICENSE.md](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md).

### Shortbread (Geofabrik)
- Leaner output than OpenMapTiles.
- Schema documentation is CC0; reference tooling is FTWPL ("Free To Whatever
  Public Licence"). Source: [Geofabrik's original
  announcement](https://x.com/geofabrik/status/1501879328526815236) and the
  [Shortbread OSM wiki page](https://wiki.openstreetmap.org/wiki/Shortbread).
  No attribution obligation from the schema itself.
- Fully open, no licence friction at all — the cleanest option on paper.
- Smaller, less mature style ecosystem: fewer off-the-shelf styles to fork for
  issue 5.1, meaning more of that issue's "get it looking like ours" work
  starts from a blanker page.
- Less deployed at UK/production scale than OpenMapTiles as a point of
  reference for this project's failure modes.

### Protomaps Basemap
- Most compact output of the three.
- Good default styling out of the box.
- Tileset (the "Produced Work" built from OSM data) is a derivative under
  **ODbL** — same attribution requirement as OSM itself, nothing additional.
  The **map style/design** is released under **CC0**. Source: [protomaps/basemaps
  README](https://github.com/protomaps/basemaps/blob/main/README.md) and
  [LICENSE_DATA.md](https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md).
- This is the *tileset and schema* product, independent of the Protomaps
  PMTiles Worker evaluated separately in issue 4.1 — choosing a different
  schema here does not preclude using that Worker.
- Requires building against the `basemaps` profile rather than Planetiler's
  built-in default, and is the newest/least battle-tested of the three at the
  scale this project targets.

## Decision

**OpenMapTiles.**

Rationale:
- It is Planetiler's default profile, which removes an entire axis of
  first-build risk (custom profile code) at the exact point in the plan
  (issue 1.1) where the goal is just to prove the build works.
- Issue 5.1 explicitly warns that style work ("label density, road hierarchy,
  colour palette") is where the calendar time goes, not schema plumbing —
  OpenMapTiles' larger style ecosystem directly reduces that cost by giving
  more forkable starting points (Positron, Dark Matter, OSM Bright).
- OpenFreeMap running this schema unmodified at scale is a real production
  reference for the failure modes this project is trying to avoid (see the
  runbook work in issue 6.3), which neither Shortbread nor Protomaps Basemap
  currently offers to the same degree.
- The larger output size is an accepted cost — R2 storage is cheap and
  egress is free (see issue 6.2's cost model), so this is not the load-bearing
  constraint that style ecosystem and production precedent are.

## Licence compatibility — confirmed

- **OSM data itself (ODbL)** requires attribution regardless of schema choice
  — handled generically in issue 5.3, independent of this decision.
- **OpenMapTiles schema/cartography (CC-BY 4.0)** requires visible attribution
  to OpenMapTiles.org in addition to the OSM attribution. This is compatible
  with the intended use (a self-hosted public basemap with an attribution
  control) — issue 5.3's attribution task should add an "OpenMapTiles.org"
  credit alongside the OSM one.
- **OpenMapTiles code/tooling (BSD 3-Clause)** — permissive, no obligation
  beyond preserving the licence notice in any redistributed tooling source.

No licence blocker identified. Proceed with OpenMapTiles.

## Consequences

- Issue 1.1's Planetiler build uses the default profile (no `--profile` flag
  needed, or explicit `--profile=openmaptiles` for clarity).
- Issue 5.1 forks a published OpenMapTiles-compatible style (Positron / Dark
  Matter / OSM Bright) rather than Protomaps or Versatiles styles.
- Issue 5.3's attribution control must credit both `© OpenStreetMap
  contributors` and OpenMapTiles.org.
- Issue 4.1 (Protomaps PMTiles Worker) is unaffected — it is schema-agnostic
  and serves whatever PMTiles archive Planetiler produces.
