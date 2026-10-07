// Where the page gets its deployment-specific facts. Everything host-specific lives
// in a `dashboard.config.json` beside the page, never in the code — the same mounted
// dashboard serves a member repo checked out locally and a fleet-wide Pages site,
// and only the config differs.
//
// THE ROSTER IS NOT A LIST. A fleet deployment names an `owner` and the page enumerates
// that owner's repos AS THE VIEWER, so the membership is decided at read time by what
// this person can actually see. That is what keeps a fleet page from leaking a repo's
// existence to someone without access, and it is why no repo list is baked into any
// file here: `owner` and `exclude` are the whole of a fleet's config.
//
// Absent config is a valid deployment, not a broken one: it means whatever repo the URL
// names, and a gate that says sign-in has not been configured. So every key here is
// optional and every miss is a plain default — every key EXCEPT `mode`, which the build
// requires and refuses to guess; see `resolveMode`.
//
// Shape:
//   {
//     "mode":        "repo",                             // "repo" | "fleet" — REQUIRED, no default
//     "clientId":    "Iv1.abc123",                       // GitHub App / OAuth App client id
//     "exchangeUrl": "https://…/github-oauth",           // the code→token endpoint
//     "redirectUri": "https://owner.github.io/Repo/",    // defaults to this page's URL
//     "scope":       "repo",                             // classic OAuth Apps only
//     "owner":       "octo",                             // a fleet: whose repos, as the viewer
//     "exclude":     ["octo/old"],                       // …and which of them are not members
//     "defaultRepo": "owner/a",
//     "deploymentRepo": "owner/site",                    // the repo the site is published from
//     "rates":       { "claude-opus-5": { "in": 15, "cacheRead": 1.5, "out": 75 } }
//   }
//
// One key is not a deployment's to set: `devToken`, which only `tooling/serve.mjs` puts
// in the config it synthesizes for a locally-served checkout (`read/auth.mjs`). The site
// build writes the list above and nothing else, so no published config can carry one.

export const DEFAULTS = {
  // WHICH DASHBOARD THIS IS, and the one key with no default. `repo` is this repo's own
  // page; `fleet` is the overview across a roster. Silence used to mean `repo`, which
  // made a fleet deployment that lost its roster source publish as a one-repo page and
  // look intentional — so the build refuses to publish a declaration that does not say.
  // Null here is not a default: it is what a locally-served checkout with no config file
  // at all reads, and `isFleetConfig` renders that as one repo's page.
  mode: null,
  clientId: null,
  exchangeUrl: null,
  redirectUri: null,
  scope: null,
  // Whose repos this deployment covers, enumerated as the viewer, and which of them are
  // not in the fleet. Both optional: unset means this is one repo's own page.
  owner: null,
  exclude: [],
  defaultRepo: null,
  // The repository the site is published from, which the build knows and the page
  // cannot: where a fleet deployment's roster artifact and its own cards are read.
  deploymentRepo: null,
  // USD per MILLION tokens, per model, per counter — the one deployment-specific fact
  // behind every dollar figure the page shows. Null is a supported state and not a
  // broken one: an unpriced page still counts tokens, and says which key to set.
  rates: null,
};

export async function loadConfig(url = './dashboard.config.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(await res.json()) };
  } catch {
    return { ...DEFAULTS };
  }
}

// The two dashboards this pack builds. A deployment is one or the other and says so.
export const MODES = Object.freeze(['repo', 'fleet']);

// Whether a config names anywhere for members to come from: an owner to enumerate.
export const hasRosterSource = (config) => Boolean(config?.owner);

// Keys a deployment used to set that nothing reads any more (design record row 111).
// Each is refused rather than ignored, because a deployment still carrying one believes
// the page does something it does not — a fixed member list, a roster artifact, a canon
// to price members against — and a silently ignored key is exactly that failure.
export const RETIRED_KEYS = Object.freeze({
  repos: 'a fleet is "owner" (enumerated as the viewer) plus "exclude"; a fixed member list is not read',
  rosterFile: 'a fleet is "owner" (enumerated as the viewer) plus "exclude"; a roster artifact is not read',
  rosterUrl: 'a fleet is "owner" (enumerated as the viewer) plus "exclude"; a roster artifact is not read',
  canonRepo: 'there is no canon to price members against; a fleet\'s freshness is the roster its fleet-roster task publishes',
});

// The mode, or a throw. This is the only place the judgment lives, so the build and the
// page cannot drift into two matching-looking expressions that disagree at one input.
//
// It refuses four things. A retired key, which a deployment still carrying it believes
// is read. A missing mode, and one that is not a mode. And the one worth having: a mode
// that CONTRADICTS the rest of the config. `fleet` naming no owner would publish a fleet
// page over nothing; `repo` beside an owner would silently ignore the owner. Both are a
// deployment that believes something the site is not doing, which is exactly the
// failure the key exists to make loud.
export function resolveMode(config) {
  const retired = Object.keys(RETIRED_KEYS).filter((k) => config?.[k] !== undefined && config?.[k] !== null);
  if (retired.length) {
    throw new Error(
      `the claudinite-single-repo-dashboard config sets ${retired.map((k) => `"${k}"`).join(', ')}, which nothing reads any more `
      + `(design record row 111): ${retired.map((k) => RETIRED_KEYS[k]).join('; ')}. Remove ${retired.length === 1 ? 'it' : 'them'}.`);
  }
  const mode = config?.mode ?? null;
  if (mode === null) {
    throw new Error(
      'this deployment does not say which dashboard it is: set "mode" to "repo" (this repo\'s own page) '
      + 'or "fleet" (the overview) in the claudinite-single-repo-dashboard config. There is no default — silence used to '
      + 'mean "repo", which let a fleet deployment that lost its roster publish as one repo and look intentional.');
  }
  if (!MODES.includes(mode)) {
    throw new Error(`claudinite-single-repo-dashboard mode "${mode}" is not a mode — it is "repo" or "fleet".`);
  }
  if (mode === 'fleet' && !hasRosterSource(config)) {
    throw new Error(
      'mode is "fleet" but the config names no roster source — add "owner", whose repos the page enumerates as '
      + 'the viewer. A fleet page over nothing is the state this guard exists to catch.');
  }
  if (mode === 'repo' && hasRosterSource(config)) {
    throw new Error(
      'mode is "repo" but the config names a roster source, which a repo page never reads — '
      + 'drop it, or set mode to "fleet".');
  }
  return mode;
}

// Whether this deployment is a FLEET one. It READS the stated mode rather than inferring
// it from the roster: what a deployment covers is a thing it declares, not a thing
// deduced from which other keys happen to be present.
export const isFleetConfig = (config) => config?.mode === 'fleet';

// Whether a NAME is on the deployment's exclude list — the Shepherd fleet's "ignore
// this repo". It takes either spelling, because a member writes whichever reads
// naturally in its own declaration.
//
// IGNORED IS A STATE, NOT A FILTER (owner, 2026-09-13). Every repo the viewer can see
// belongs on the fleet page, including the ones the fleet does not act on: an ignored
// repo and an archived one are drawn greyed, with their core GitHub facts and a way
// back into the fleet, rather than left off a page whose reader then cannot tell them
// from a repo that does not exist. What ignoring buys is that no fleet OPERATION
// touches them and no figure counts them — which is the sweeps' business, not the
// page's.
export const ignored = (fullName, exclude = []) =>
  exclude.includes(fullName) || exclude.includes(fullName.split('/')[1]);

// @deprecated The roster no longer subtracts anyone: every repo the viewer can see is
// drawn, and what used to be filtered out here is now a row's STATE (`ignored`, above,
// and GitHub's own `archived`, read per repo). Kept because a member's local pack may
// import it, and a predicate over a repo object cannot break by standing still — it
// still answers the old question, "would the fleet's figures count this repo".
export const inFleet = (repo, exclude = []) =>
  !repo.archived && !repo.fork && !ignored(repo.full_name, exclude);

// The roster, resolved: `owner` enumerated live as the viewer. `gh` is injected so this
// is testable without a network and so config.mjs owes the GitHub client nothing.
export async function resolveRoster(config, token, gh) {
  const exclude = config?.exclude ?? [];
  // The ignored NAMES travel beside the roster rather than being subtracted from it:
  // the page draws them, greyed, and needs to know which they are. Archived is not
  // here — it is GitHub's own flag, read per repo with everything else about it.
  const markIgnored = (repos) => repos.filter((r) => ignored(r, exclude));

  if (!config?.owner) return { repos: [], ignored: [], source: 'none', complete: true };
  try {
    const { repos, complete } = await gh.listOwnerRepos(config.owner, token);
    // A FORK is still not a member: it is someone else's project, and its work is
    // upstream's. Everything else the viewer can see is on the page.
    const names = repos.filter((r) => !r.fork).map((r) => r.full_name).sort();
    return {
      repos: names,
      ignored: markIgnored(names),
      source: 'owner',
      // Whether the enumeration reached the end of the account. A truncated one is
      // said out loud rather than rendered as a fleet that happens to be that size.
      complete,
    };
  } catch (error) {
    return { repos: [], ignored: [], source: 'owner', complete: false, error };
  }
}
