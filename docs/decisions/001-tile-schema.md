# 001 — Tile schema: Shortbread

**Status:** Decided
**Date:** 2026-08-26
**Issue:** #1 (plan item 0.1)

## Context

Planetiler can build against three viable vector tile schemas, each with different
tooling maturity, output size, and licence terms. This is a foundational decision:
it shapes the Planetiler build profile, which pre-built styles are available for
issue 5.1, and what attribution obligations apply on top of the OSM/ODbL
requirement that exists regardless of schema (issue 5.3).

This decision was revisited after the initial choice of OpenMapTiles — see
"Revision" below.

## Options considered

### OpenMapTiles
- Planetiler's **default** build profile — no custom profile config needed to
  get a first build.
- Largest ecosystem of ready-made, actively maintained styles (Positron, Dark
  Matter, OSM Bright, Klokantech Basic) — usable as starting points to fork
  for issue 5.1.
- What OpenFreeMap runs unmodified — a real production reference, but a
  volunteer-run mirror project rather than the canonical OSM deployment.
- Largest output size of the three options.
- Licence: code/tooling is BSD. The schema/cartography design itself is
  **CC-BY 4.0**, requiring a visible attribution credit to OpenMapTiles.org
  *in addition to* the OSM/ODbL attribution every option already needs.
  Source: [openmaptiles/openmaptiles
  LICENSE.md](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md).

### Shortbread (Geofabrik / shortbread-tiles)
- Schema documentation is **CC0**; reference tooling is FTWPL ("Free To
  Whatever Public Licence"). No attribution obligation beyond the OSM/ODbL
  credit every option needs anyway. Source: [Geofabrik's original
  announcement](https://x.com/geofabrik/status/1501879328526815236),
  [Shortbread OSM wiki page](https://wiki.openstreetmap.org/wiki/Shortbread).
- **Deployed on OpenStreetMap.org itself since July 2025** — the OSM
  Foundation's own website vector tile layer runs on this schema. Source:
  [OSM blog, "Vector Tiles are deployed on
  OpenStreetMap.org"](https://blog.openstreetmap.org/2025/07/22/vector-tiles-are-deployed-on-openstreetmap-org/).
  This is a stronger production reference than OpenFreeMap: it's the
  canonical OSM deployment, not a third-party mirror.
- Leaner output than OpenMapTiles — smaller archive, marginally cheaper R2
  storage and faster builds.
- Planetiler has native support via a `shortbread.yml` YAML profile since
  v0.6.0, plus the maintained
  [`planetiler-shortbread`](https://github.com/versatiles-org/planetiler-shortbread)
  project. No custom Java profile required — this closes the tooling gap
  that originally favoured OpenMapTiles.
- Smaller style catalogue: VersaTiles Colorful, VersaTiles Neutrino, and
  Shortbread-Mapnik are the actively maintained options, versus
  OpenMapTiles' larger set. This matters less than it first appears — see
  "Style ecosystem doesn't gate custom styling" below.

### Protomaps Basemap
- Most compact output of the three.
- Good default styling out of the box.
- Tileset is a derivative under **ODbL** (same obligation as OSM itself); the
  **style/design** is CC0. Source: [protomaps/basemaps
  README](https://github.com/protomaps/basemaps/blob/main/README.md),
  [LICENSE_DATA.md](https://github.com/protomaps/basemaps/blob/main/LICENSE_DATA.md).
- Independent of the Protomaps PMTiles Worker evaluated separately in issue
  4.1 — choosing a different schema here does not preclude using that Worker.
- Requires the `basemaps` profile rather than Planetiler's built-in default,
  and is the newest/least battle-tested of the three at the scale this
  project targets.

## Style ecosystem doesn't gate custom styling

Both OpenMapTiles and Shortbread are just named layers and attributes inside
a vector tile; a MapLibre style is JSON that says how to draw those layers.
Nothing about MapLibre's styling pipeline is schema-specific, and issue 5.1
already scopes real customization work either way ("getting a map that
looks like *yours* rather than a demo is where the calendar time actually
goes"). A bigger catalogue of forkable starting points is a head start, not
a capability difference — three actively-maintained Shortbread styles,
including one purpose-built for this schema (Shortbread-Mapnik), is enough
to start issue 5.1 from.

## Decision

**Shortbread.**

Rationale:
- **Licence is strictly simpler.** CC0/FTWPL means no attribution obligation
  beyond the OSM/ODbL credit every option requires anyway — one fewer
  ongoing legal/compliance surface, and one fewer line item for issue 5.3.
- **Stronger production precedent than initially assessed.** OpenStreetMap.org
  itself runs this schema in production as of July 2025. That is a better
  reference for "will this hold up" than OpenFreeMap's OpenMapTiles
  deployment, which was the deciding factor in the original (superseded)
  choice.
- **The tooling gap that favoured OpenMapTiles no longer exists.** Planetiler
  has native Shortbread support since v0.6.0; this is not "write a custom
  profile" territory.
- **The style-ecosystem gap doesn't change the shape of issue 5.1's work** —
  see above — so it isn't a real cost worth trading against the licence and
  precedent advantages.
- Leaner output is a minor additional benefit, not the deciding factor.

## Licence compatibility — confirmed

- **OSM data itself (ODbL)** requires attribution regardless of schema choice
  — handled generically in issue 5.3, independent of this decision.
- **Shortbread schema (CC0)** and **reference tooling (FTWPL)** impose no
  additional attribution or licence obligation.
- No licence blocker identified. Proceed with Shortbread.

## Consequences

- Issue 1.1's Planetiler build uses the `shortbread.yml` YAML profile (or the
  `planetiler-shortbread` image), not Planetiler's OpenMapTiles default.
- Issue 5.1 forks a Shortbread-compatible style — VersaTiles Colorful,
  VersaTiles Neutrino, or Shortbread-Mapnik — rather than an OpenMapTiles
  style.
- Issue 5.3's attribution control needs only the standard `©
  OpenStreetMap contributors` credit; no second schema-attribution line is
  required.
- Issue 4.1 (Protomaps PMTiles Worker) is unaffected — it is schema-agnostic
  and serves whatever PMTiles archive Planetiler produces.

## Revision

The initial pass at this decision (same date) chose OpenMapTiles, weighing
its larger style ecosystem and OpenFreeMap's production track record most
heavily. On review, two of the starting facts didn't hold up:
OpenStreetMap.org's own move to Shortbread in July 2025 is a
stronger precedent than OpenFreeMap's OpenMapTiles deployment, and
Planetiler's native Shortbread support since v0.6.0 removed the "no default
profile" cost. With those corrected, the licence and precedent advantages of
Shortbread outweigh OpenMapTiles' larger (but non-gating) style catalogue.
