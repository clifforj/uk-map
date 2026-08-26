# 002 — Rebuild cadence: weekly

**Status:** Decided
**Date:** 2026-08-26
**Issue:** #2 (plan item 0.2)

## Context

Archives are published under versioned filenames (issue 3.3), so **every
rebuild invalidates the entire edge cache for the previous version** — the
old filename simply stops being requested and every tile under the new
filename starts cold. Cache hit rate craters at each cutover, and the
project's cost drivers — Workers requests and R2 Class B operations — only
bill on cache misses. Rebuild cadence is therefore a direct cost and latency
lever, not just a freshness knob.

OpenFreeMap rebuilds the planet weekly and reports a 99.4% CDN cache rate.
That number is only achievable *because* rebuilds are infrequent relative to
request volume — a nightly cadence would spend a meaningfully larger share
of requests re-warming the cache.

## Freshness requirement

This is a basemap (roads, coastline, land use, place labels) for a UK map —
not a data layer for live features like traffic, POIs, or routing. Basemap
geometry does not visibly change day to day, and OSM edits in any given week
are a tiny fraction of total UK coverage. Nothing downstream depends on the
tiles reflecting an edit within hours or even a few days of it landing in
OSM. Being up to 7 days stale is invisible to a map viewer and has no
functional consequence for any planned use of this map.

## Decision

**Weekly**, matching the plan's stated default and OpenFreeMap's precedent.

- No nightly requirement was identified — nothing breaks at up-to-7-day
  staleness, so there's no stated reason to accept nightly's cache-warmth
  cost.
- This feeds issue 3.2's cron schedule directly: `0 2 * * 3` (Wednesday
  02:00 UTC), matching the example already sketched in the plan.

## Cache-warmth trade-off

Accepted explicitly: each weekly rebuild produces one cold-cache cutover
per week rather than one every night. At weekly cadence the cold period is a
small fraction of total traffic, which is the mechanism behind OpenFreeMap's
99.4% figure. Issue 6.2 measures this project's actual before/after
promotion cache hit rate to confirm the same holds here; if warming cost
turns out material, cadence should be revisited then with real numbers
rather than estimated.

## Consequences

- Issue 3.2's build workflow cron is set to weekly (`0 2 * * 3`).
- Issue 3.5's promotion workflow can layer a scheduled auto-promote on the
  same weekly rhythm, with manual `workflow_dispatch` kept available for
  out-of-band promotions.
- Issue 3.6's retention window (suggested: last 4 builds) is sized against
  weekly cadence, giving roughly a month of rollback targets.
- Issue 6.2 should treat weekly-cadence cache hit rate as the number to
  compare against OpenFreeMap's 99.4% baseline.
