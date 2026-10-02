## 2026-09-01 · born · converted from references.md (check:conformance-work-scope)
- **Reason:** #939: canon content edited without a version move shipped to nobody for five days
  across seven repos while every whole-tree check stayed green — only a change-scoped sweep can
  see "did THIS change move it".
- **Mechanism:** a check
- **Retire when:** Retire the check only if the tree itself can show a missing per-change move.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).

## 2026-10-02 · retired · `cn verify` answers it (missingbulb/ClaudiniteEngine#41)
- **Reason:** verify's `member-workflows` rule and `cn workflows diff` judge the member's CI workflow against the engine's template, which runs `cn check world` over the change on every pull request; a port would be a second check over the same file, written for the Node
  member's shape.
- **Actor:** @missingbulb (owner), through the chunk 9 plan.
