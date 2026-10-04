## 2026-10-01 · born · The hello pack: the first pack the Go engine loads end to end (ClaudiniteEngine#25)
- **Reason:** the pack chassis needs one real pack to prove a member receives rules, a skill and a
  coded check from a published index, on the rc package before anything else rides on it.
- **Actor:** @missingbulb (owner), through the chunk 4 plan.
- **Mechanism:** a copy of the engine's `release/testdata/hello` fixture; `minEngineVersion` names
  the rc release that ships the chassis.
- **Landed:** pending.

## 2026-10-04 · scope-changed · the version takes the <major>.<day>.<n> form
- **Reason:** pack versions follow the Engine's `<major>.<day>.<n>` scheme; an index sorts every
  earlier version below one in that form, so this one outranks what the pack store already holds.
- **Actor:** @missingbulb (owner), asking that pack versions follow the same scheme.
- **Model:** Claude Opus 5.5
- **Mechanism:** the manifest's `version`, which the release now requires in this form for a new
  version. hello 1.61004.1.
