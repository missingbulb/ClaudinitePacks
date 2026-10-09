# publish-pages

Republishes the dashboard site to GitHub Pages when the page's sources have moved,
and does not report success until the deploy run it started has concluded.

The task runs no agent: `worker.mjs` builds the site with
[`build-site.mjs`](../../tooling/build-site.mjs), force-pushes the result as one commit to the
`gh-pages` branch, dispatches [the seeded workflow](../../stubs/workflows/claudinite-single-repo-dashboard-pages.yml)
on the default branch, and follows that run to its end.

## Why the workflow still exists, and why it is four steps

A Pages deploy with source *GitHub Actions* needs two things only a workflow job has:
an Actions artifact, uploaded through a runtime credential that is handed to action
steps and not to `run:` steps, and an OIDC token minted for a job in this repo, which
the Pages deployment API requires. So there is no deploying that way from code-work,
and the workflow keeps exactly the steps that need it — checkout of `gh-pages`,
`configure-pages`, `upload-pages-artifact`, `deploy-pages` — and nothing that could
ever need to change. The build, its inputs, and the decision to run are all the task's;
`gh-pages` is how the built tree reaches the runner.

## What it needs

| Where | Name | What it is |
|---|---|---|
| `.github/workflows/` | `claudinite-single-repo-dashboard-pages.yml` | the workflow adoption seeded; a `workflow_dispatch`-only shim |
| Repository setting | Pages, source *GitHub Actions* | the one step no Action can take. Until it is set the run parks at `needs-human-action` naming it |
| Repo **variable** | `CLAUDINITE_DASHBOARD_CLIENT_ID`, `CLAUDINITE_DASHBOARD_EXCHANGE_URL` | *optional*; the sign-in pair, read by the build |

No secret: the push, the dispatch and the follow use the Action's own token.

## When it runs

Daily, after the engine's `engine/update` task, and only when the mount or the
member's declaration moved in the window — its `.claudinite/settings.*` file, or a Node
member's `.claudinite-settings.json`, which the precondition names until phase 9 retires
that shape. A change to either repository variable is not a signal the queue sees —
force a republish by dispatching the scheduler workflow with `wake` naming
`claudinite-single-repo-dashboard/publish-pages`.

## What a run does

1. Builds the site into a scratch directory from the declaration in
   `.claudinite/cache/member.GENERATED.json`. A build that refuses (a member file missing or
   unreadable, which it names with `cn tasks flat --write`; a fleet key or a `mode` other than `"repo"`)
   fails here; a pack present without its page ends the run with nothing to publish.
2. Writes `deployed.json` at the site root — the sources' sha — and force-pushes the
   tree as a single root commit to `gh-pages`. No history is kept: the branch holds
   the last build and nothing else.
3. Dispatches the workflow and finds the run it created.
4. Follows the run. `success` reports the run's URL; a failure with Pages not enabled
   parks for the person who can enable it; any other failure parks with the URL.
