// The deployment's settings, and where each one lives.
//
// ONE READER, because two things need the same facts and must never disagree about
// where sign-in is configured: the site build (which bakes the pair into the page's
// own config) and the deploy-oauth-exchange task (which mints the URL the pair names).
// A second copy would let a deployment configure the button against one App and the
// endpoint against another.
//
// TWO STORES, split by who has to edit them. Everything describing what the dashboard
// COVERS — its mode, owner, exclusions — is the member's own declaration, where it is
// reviewable in a diff, and is read here out of the member file its `cn` writes from it
// (`.claudinite/cache/member.GENERATED.json`), the one JSON statement of a declaration
// kept in YAML, TOML or JSON. The sign-in pair are REPOSITORY VARIABLES: they
// are the two values an owner sets while standing in the GitHub App's settings page,
// and `exchangeUrl` in particular is minted by a deploy rather than authored, so
// asking for a commit to record it puts a merge between the endpoint going live and
// the button appearing.
//
// Neither is a secret. The client id is in every authorize URL the page builds and the
// exchange URL is fetched by the browser, so both are public by construction; a
// variable is simply the non-committed store for a non-sensitive value.
//
// THE DECLARATION IS STILL READ, as the fallback, and a build that uses it says so.
// Nothing converges a member's own settings file, so a deployment that configured the
// pair before this existed must keep working rather than losing its Sign in button on
// the next build. That fallback is the migration, not a second supported store.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SIGN_IN_VARS } from '../src/read/signin-vars.mjs';
import { MEMBER_PATH, LEGACY_MEMBER_PATH, memberFromFile } from '../src/read/member.mjs';

export const PACK_ID = 'claudinite-single-repo-dashboard';

// The repository variables the sign-in pair travel in. Defined in `src/read/` and
// re-exported here: the page's own gate names them too, and it cannot import a module
// that reads the filesystem.
export { SIGN_IN_VARS } from '../src/read/signin-vars.mjs';

const WRITE_IT = 'run `cn tasks flat --write` and commit what it writes';

// The member file's text, at its old path only when the new one is missing; a missing
// file is reported at the new path, where `cn tasks flat --write` writes it.
async function readMemberText(repoRoot) {
  try {
    return await readFile(join(repoRoot, MEMBER_PATH), 'utf8');
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
    try { return await readFile(join(repoRoot, LEGACY_MEMBER_PATH), 'utf8'); } catch { throw e; }
  }
}

// This pack's `config` as the member declares it, `{}` where the member file names no
// config for it, and `fault`: null, or why the member file cannot be read, naming the
// file and the command that writes it. A file never written and one that does not read
// are different faults, and neither is a member that simply declared nothing.
export async function declaredConfig(repoRoot) {
  let text;
  try {
    text = await readMemberText(repoRoot);
  } catch (e) {
    const why = e?.code === 'ENOENT' ? 'is missing' : `could not be read (${e?.code ?? e?.message ?? e})`;
    return { config: {}, fault: `${MEMBER_PATH} ${why}: ${WRITE_IT}` };
  }
  const member = memberFromFile(text);
  if (member.fault) return { config: {}, fault: `${member.fault}: ${WRITE_IT}` };
  const config = member.declared.find((p) => p.id === PACK_ID)?.config;
  return { config: config ? { ...config } : {}, fault: null };
}

// The declaration with the sign-in pair resolved: the variable where it is set, the
// declared value otherwise. `legacy` names the keys that fell back, for the caller to
// report — a deployment still configuring these in git is working but on the old
// footing, and silence would leave that indefinitely undiscovered. `memberFault` is
// declaredConfig's, for the caller to refuse on.
//
// An empty variable is UNSET, not an override: a repository variable cleared in the
// settings box still arrives as an empty string, and reading that as "no client id"
// where the declaration has one would turn a cleared box into a silently disabled
// button.
export async function deploymentConfig(repoRoot, env = process.env) {
  const { config: cfg, fault: memberFault } = await declaredConfig(repoRoot);
  const legacy = [];
  for (const [key, variable] of Object.entries(SIGN_IN_VARS)) {
    const fromVar = String(env[variable] ?? '').trim();
    if (fromVar) cfg[key] = fromVar;
    else if (cfg[key]) legacy.push(`${key} (set \`${variable}\` instead)`);
  }
  return { cfg, legacy, memberFault };
}
