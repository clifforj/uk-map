# 005 — Abuse protection and request caps

**Status:** Decided (rate-limiting rule pending manual dashboard application)
**Date:** 2026-08-26
**Issue:** #19 (plan item 4.3)

## Context

The tile endpoint (`tiles.example.com`, see the `TILE_HOSTNAME` secret) is
public and unauthenticated. The cost driver is Workers requests, which bill
on every hit including cache hits, so an unexpected traffic spike (a third
party embedding the map, a scraper, a botnet) is the main financial and
availability risk. OpenFreeMap's largest incident (3 billion requests/24h
from one adopting site) is the reference case.

This session doesn't have Cloudflare dashboard or API access (no
`wrangler`, no `CLOUDFLARE_API_TOKEN` — only S3-scoped R2 credentials exist
as repo secrets), so the rate-limiting rule below is a spec to apply
manually, not something applied by this change.

## What a legitimate heavy user looks like vs. scraping

- **Legitimate:** a browser tab with MapLibre GL open, panning/zooming.
  MapLibre caps concurrent tile fetches per source (~16 in flight) and only
  requests tiles for the current viewport plus a small buffer. Even fast,
  continuous panning across zoom levels tops out at low tens of requests
  per second from one IP, in short bursts, with `Referer`/navigation
  context and a browser `User-Agent`.
- **Scraping/abuse:** sustained high request rates with no idle periods,
  requests that don't correlate with a plausible viewport (e.g. systematic
  z/x/y sweeps), missing `Referer`, non-browser `User-Agent` strings, or
  volume from a small number of IPs/ASNs far exceeding what a single
  human's map session could generate.

The rule below is sized to clear the legitimate case with margin and only
bite on the second.

## Decision

**Rate-limiting rule (Free plan: 1 rule, IP-based counting only):**

| Field | Value |
|---|---|
| Expression | `http.host eq "tiles.example.com"` (i.e. every path on the tile hostname — tiles, `/fonts/`, `/sprites/`, TileJSON) |
| Characteristic | Source IP |
| Period | 10 seconds |
| Threshold | 600 requests |
| Mitigation timeout | 60 seconds |
| Action | Block (not Challenge — MapLibre issues plain `fetch()`/XHR requests, which can't complete a JS/managed challenge, so a challenge action would just look like an outage to a real client) |

600 req/10s (60 req/s) is well above the low-tens/s ceiling a real MapLibre
session produces, so normal use shouldn't trip it. Once tripped, a single
IP is capped at roughly 600 requests per 70-second cycle (10s window + 60s
block) sustained, i.e. ~740k requests/day worst case from one IP — bounded,
not eliminated, since Free plan rate limiting is IP-only with a single rule
(no ASN- or fingerprint-based counting, and no protection against a
distributed set of IPs each staying under the per-IP threshold). That
residual risk is accepted as the cost of staying on the Free plan; revisit
(Business plan, 5 rules, IP+NAT/custom expressions) only if distributed
abuse is actually observed.

**Referer allowlist:** not configured yet. No consuming domain is fixed —
the demo page's domain isn't decided (issue 5.2 is still open), matching
issue 4.2's `ALLOWED_ORIGINS` deferral for the same reason. Revisit
alongside 4.2 once 5.2 picks a domain: at that point a `http.referer`
condition scoped to the known domain(s) could be added as a second
condition on the same rule (Free plan supports `Referer`/`Host`/`Path` as
free characteristics in the rule *expression*, distinct from the paid-only
rate-limiting *counting* characteristics).

**Workers daily request alarm:** no custom alarm needed. Cloudflare
automatically emails the account's billing address at 75% and 100% of the
Workers Free plan's 100k-requests/day cap, with no configuration required —
confirmed via Cloudflare community reports and consistent with issue 4.1's
closeout finding that the Free plan fails loudly (errors) rather than
silently over-billing past the daily cap. No new secret, webhook, or
dashboard setup needed, consistent with this project's existing
no-new-external-service preference ([[004-notification-channel]]).

**Response if a third party starts using the endpoint at volume:**
1. The rate-limiting rule above bounds any single IP's worst case; the
   automatic 75%/100% emails are the trip-wire for aggregate volume.
2. On a genuine trip: check Workers/R2 analytics for the source (IP/ASN,
   Referer, User-Agent) before reacting.
   - If it's a known/desirable integration (someone else has embedded the
     public map, which is the intended use of a self-hosted basemap):
     decide whether to welcome it (upgrade to Workers Paid — $5/month base,
     10M requests included, $0.30/million overage) or ask them to run
     their own PMTiles copy.
   - If it's scraping/abuse: tighten the rate-limiting threshold, add the
     Referer allowlist once a real one exists, or block the offending
     IP/ASN outright via a WAF custom rule.
3. Default to staying on Workers Free rather than pre-emptively upgrading —
   the Free plan's failure mode is an explicit error, not a surprise bill,
   so there's no cost risk in waiting for a real signal first.

## Worst-case documented monthly cost with caps in place

- **Workers:** $0 while on the Free plan — the 100k/day cap fails closed
  (503s), it does not overflow into billed usage. This is the accepted
  worst case unless a deliberate upgrade decision is made per the response
  policy above.
- **R2 reads (Class B ops, cache misses only):** tiles cache at Cloudflare's
  edge (`cf-cache-status: HIT` confirmed in issue 4.1), so cache-miss volume
  is far below raw request volume and shared across all clients hitting the
  same tile, not per-abuser. Even the bounded single-IP worst case above
  (~740k requests/day) mostly re-hits already-cached tiles rather than
  generating 740k distinct R2 reads. Not actively monitored yet (noted as a
  gap in issue 4.1's closeout); revisit if the R2 dashboard's usage graph
  shows a sustained climb.
- **If Workers Paid is deliberately adopted** to accommodate a legitimate
  high-volume integration: $5/month base + $0.30/million requests beyond
  the included 10M/month — an explicit, budgeted decision at that point,
  not a caps-driven worst case.

## Consequences

- The rate-limiting rule table above needs to be applied by hand in the
  Cloudflare dashboard (Security → WAF → Rate limiting rules) against
  `tiles.example.com` — not automated in this change, since this session
  has no Cloudflare credentials. Issue #19 stays open/in-progress until
  that's confirmed live.
- Revisit the Referer allowlist and this rule's scope once issue 5.2 fixes
  the demo page's domain, in lockstep with issue 4.2.
- If distributed (many-IP) abuse is ever observed, the Free plan's
  single-rule/IP-only limitation is the ceiling on what this rule alone can
  do — upgrading to Business (5 rules, richer counting characteristics) is
  the documented next step, not a rewrite of this decision.
