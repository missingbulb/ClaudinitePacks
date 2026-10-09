# task-flow — filing, deferring, sequencing and proving work through the queue

## Sizing a change

- **Starting a change** — state its expected size up front, in files, where the change is
  tracked. An expectedly tiny change that reaches more than 10 files is a signal that the design
  structure or the complexity it assumed was misjudged, not a reason to push on: stop, re-examine
  that structure and say what you found where the change is tracked before going further.
  (stating-expected-size)

## Plans and migrations

- **Planning a migration** — prefer the design that converges in one forced pass to the one that
  trickles across nightly cycles, accept legacy input at the door so nothing has to wait for
  stragglers, and drive the stragglers with a standing mechanism rather than a phase someone must
  remember to close. Write every phase's code — the cleanup, the destructive tail and every
  legacy tolerance's removal included — before asking for approval, and chain each execution step
  to the verification of the one before it rather than to anyone's memory;
  [writing-migration-plans](skills/writing-migration-plans/SKILL.md) owns that ordering and the
  chain's mechanics. (planning-migration)

- **Filing the issues a multi-step plan or migration decomposes into** — take the owner's
  approval of the plan first, in one submission carrying a line per step, the graph of which
  step waits on which, and each link's automerge policy beside the diff it was predicted from.
  Filed first, the plan is a structure to react to rather than a decision to make.
  (filing-issues-multi)

- **Adding a legacy tolerance** (a dual read, an accepted old spelling, a shim) — it is
  scaffolding, not a feature: ship it with an advisory that fires where the old shape is still in
  use, and with its removal already a link in the migration's chain, due one stated convergence
  window after that advisory reaches the holders. (adding-legacy-tolerance)

## Deferring and verifying through the queue

- **When verifying now is genuinely impossible** (an external release window, an upstream fix in
  flight, an effect that only appears once the change is deployed, converged or loaded by a later
  session) — the follow-up is a mechanism that comes to you, never a human's memory and never an
  offer to the owner to go and check later. File it with
  [verify-in-production](skills/verify-in-production/SKILL.md), unasked, **once the PR has
  merged** and never before — a PR can be rejected, and a still-open branch can be rewritten
  under you, either of which strands a verification whose premise never reached `main`. The
  skill owns both halves — whether this change needs one at all (most don't; a test that ran is
  already the mechanism), and the issue that states what puts the change in production and what
  proves it works there. (verifying-now-genuinely)

- **Spotting a change that should wait until the work in flight lands** — file it as work that
  comes back on its own rather than doing it now or trusting anyone to remember it: the
  [do-later](skills/do-later/SKILL.md) skill, which queues it behind what it waits on.
  (spotting-change-should)

- **Filing anything into the ad-hoc queue** (a deferral, a verification, any marked issue) — it
  asks an unattended session **on this repository** to do the work, so only file what such a
  session can actually do here. A read of another repository or a console is not work it can do:
  that item parks minutes after it is picked, and a park is a person's problem filed under a
  mechanism's name. A public URL is the one exception, through the coded verification form
  (`verify-in-production`'s probes) and never by asking a session to fetch it. (filing-anything-ad)

- **Finding the queue cannot reach the work you were about to file** — do it now, hand it to a
  routine that has the reach, or do not file it — and say which of the three you chose.
  (finding-queue-cannot)
