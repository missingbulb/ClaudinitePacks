// Where the page gets its deployment-specific facts. Everything host-specific lives
// in a `dashboard.config.json` beside the page, never in the code — the same mounted
// dashboard serves a member repo checked out locally and its Pages site, and only the
// config differs.
//
// Absent config is a valid deployment, not a broken one: it means whatever repo the URL
// names, and a gate that says sign-in has not been configured. So every key here is
// optional and every miss is a plain default.
//
// Shape:
//   {
//     "clientId":    "Iv1.abc123",                       // GitHub App / OAuth App client id
//     "exchangeUrl": "https://…/github-oauth",           // the code→token endpoint
//     "redirectUri": "https://owner.github.io/Repo/",    // defaults to this page's URL
//     "scope":       "repo",                             // classic OAuth Apps only
//     "defaultRepo": "owner/a",
//     "rates":       { "claude-opus-5": { "in": 15, "cacheRead": 1.5, "out": 75 } }
//   }
//
// One key is not a deployment's to set: `devToken`, which only `tooling/serve.mjs` puts
// in the config it synthesizes for a locally-served checkout (`read/auth.mjs`). The site
// build writes the list above and nothing else, so no published config can carry one.

export const DEFAULTS = {
  clientId: null,
  exchangeUrl: null,
  redirectUri: null,
  scope: null,
  defaultRepo: null,
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

// Keys a deployment may still set that nothing reads. Each is refused rather than
// ignored, because a deployment still carrying one believes the page does something it
// does not, and a silently ignored key is exactly that failure.
const FLEET = 'this pack shows one repository; a fleet overview is not something it builds';
export const RETIRED_KEYS = Object.freeze({
  owner: FLEET,
  exclude: FLEET,
  repos: FLEET,
  rosterFile: FLEET,
  rosterUrl: FLEET,
  canonRepo: FLEET,
});

// The config, or a throw naming every key the build refuses. `mode` is accepted only as
// "repo", which is what the page is; any other value is a deployment expecting a page
// this pack does not build.
export function checkConfig(config) {
  const retired = Object.keys(RETIRED_KEYS).filter((k) => config?.[k] !== undefined && config?.[k] !== null);
  if (retired.length) {
    throw new Error(
      `the claudinite-single-repo-dashboard config sets ${retired.map((k) => `"${k}"`).join(', ')}, which nothing reads: `
      + `${RETIRED_KEYS[retired[0]]}. Remove ${retired.length === 1 ? 'it' : 'them'}.`);
  }
  const mode = config?.mode ?? null;
  if (mode !== null && mode !== 'repo') {
    throw new Error(`the claudinite-single-repo-dashboard config sets mode "${mode}": ${FLEET}. Remove "mode".`);
  }
  return config;
}
