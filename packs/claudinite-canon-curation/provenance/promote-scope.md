## 2026-10-07 · born · the promote write-surface gate becomes a work check in the pack
- **Source:** `cn growth promote-scope`, the engine command that carried the gate until now.
- **Reason:** owner decision, 2026-10-07: canon curation is a pack, so the gate on promote's runs
  leaves the engine for the pack it polices.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a work-scoped Go check keyed on a branch whose name carries `growth-promote`, as
  the CI step before it was: every path changed, deleted or left untracked since the merge base must
  sit under `packs/` or a root the entry's `config.write_paths` names, and a promote branch with no
  merge base is a finding rather than a pass. It runs at the promote session's Stop, where the
  canon's CI never ran the command.
- **Rejected:** a world check, which sees no change to scope; an always-on work check, which would
  refuse every ordinary change outside the shelf.
