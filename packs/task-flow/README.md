# task-flow — filing, deferring, sequencing and proving work through the queue

The workflow side of the work-item queue: how a session files work that should not or cannot be
done now so that it comes back on its own, how a plan's phases are chained so nothing stalls
mid-run, and how a merged change gets proven in production. The queue, the executor and the task
contract are the claudinite-tasks pack's; this pack requires it, and `basics` for the lifecycle of
the work done now.

## Tasks

| Task | Runs when | What it does |
|---|---|---|
| `implement-request` ([tasks/implement-request/task.md](tasks/implement-request/task.md)) | a person with push access marks an ordinary issue `task:origin:ad-hoc` and the `request-eligible` precondition holds | implements the issue, that issue being the work item, and opens one pull request; runs at the model the item names |
| `verify-production` ([tasks/verify-production/README.md](tasks/verify-production/README.md)) | a verification issue naming `Task: task-flow/verify-production` is marked | fetches the issue's declarative probes Action-side and judges them as code: not yet live re-arms the item, a failing verify probe reopens the original issue |

`verify-production` carries its own copy of the REST client (`github-api.mjs`) for the one call
the SDK names no action for, the reopen.

## Skills

| Skill | Reach for it when |
|---|---|
| [do-later](skills/do-later/SKILL.md) | a change should wait until the work in flight lands; `/do-later …` or "after this lands" force it |
| [writing-migration-plans](skills/writing-migration-plans/SKILL.md) | writing a design doc, migration, rollout or phased plan, or working through a plan's tracking issue |
| [verify-in-production](skills/verify-in-production/SKILL.md) | right after a merge, to decide whether the change can only be proven in production and, if so, to file the verification |

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Planning a migration | medium | complexity | prose: <100 words + skill (`writing-migration-plans`) |
| Filing a plan's issues | high | correctness | prose: <100 words + skill (`writing-migration-plans`) |
| Adding a legacy tolerance | high | complexity | prose: <100 words |
| When verifying now is genuinely impossible | high | correctness | prose: <200 words + skill (`verify-in-production`) |
| Spotting a change that should wait | medium | complexity | prose: <50 words + skill (`do-later`) |
| Filing anything into the ad-hoc queue | high | correctness | prose: <100 words |
| The queue cannot reach the work | high | correctness | prose: <50 words |

## Tests

`test/` holds the `verify-production` worker's tests, run against the SDK stand-in in
`tools/test/`, and the check that the `verify-in-production` skill prescribes the two templates
the queue reads.
