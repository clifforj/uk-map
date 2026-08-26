# 004 — Notification channel: GitHub Issues

**Status:** Decided
**Date:** 2026-08-26
**Issue:** #16 (plan item 3.7)

## Context

Issue 3.7 needs a "chosen channel" for build/validation-gate failures and
promotions to show up in. Two constraints narrowed this quickly:

- This is a solo project with no Slack/email integration already wired up —
  adding one means a new webhook secret and a new external dependency for a
  weekly-cadence workload.
- GitHub's default failure notifications for `schedule`-triggered workflows
  only go to whoever last edited the workflow file, and only if their
  personal notification settings are configured to catch it. That's exactly
  the "easy to miss" gap the issue calls out — it isn't reliable enough to
  be the plan.

## Decision

**File a GitHub issue** on the repo for every build failure, validation-gate
failure, and promotion, using `actions/github-script` with the default
`GITHUB_TOKEN` (`issues: write` permission, no new secrets). This is
independent of any one person's notification settings — anyone watching the
repo (or checking it) sees failures and promotions as issues, and each issue
links straight to the run and names the failing job/step.

Rationale:
- No new secret or external service to provision or rotate.
- Doesn't depend on GitHub's per-user email defaults for `schedule` triggers
  — an issue gets filed regardless of who last touched the workflow file.
- Consistent with how this project already tracks everything else (plan
  items are GitHub issues); a promotion or failure showing up as an issue
  fits the existing workflow rather than adding a second system to check.

## Consequences

- `stage-tiles.yml` gets a `notify-on-failure` job (`if: failure()`) covering
  both the build and validate jobs.
- `promote.yml` gets a `notify` job: files an issue on every successful
  promotion, and a separate one on validate/promote failure.
- Revisit if this project grows collaborators who'd rather get a push
  notification (Slack) than have to watch the issue list.
