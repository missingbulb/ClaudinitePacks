// The engine's decision cores, asked of a real cn: `cn tasks <kind> --world F`
// answers the contract, the precondition evaluator, the merge policy and the work
// item's grammar over a JSON fixture, and `cn growth decide` the capture's log names. A pack's test pins its own declarations and
// documents against the engine that runs them through this, never against a copy.
//
// CLAUDINITE_CN names the binary; with none, a test passing `needsCn` as its options
// is skipped rather than failed, so the suite still runs where no cn is built.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CN = process.env.CLAUDINITE_CN || null;

export const needsCn = CN ? {} : { skip: 'CLAUDINITE_CN names no cn binary' };

export function cnTasks(kind, world) {
  const dir = mkdtempSync(join(tmpdir(), 'acme-cn-tasks-'));
  try {
    const file = join(dir, 'world.json');
    writeFileSync(file, JSON.stringify(world));
    const r = spawnSync(CN, ['tasks', kind, '--world', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`cn tasks ${kind} exited ${r.status}: ${r.stderr || r.stdout}`);
    return JSON.parse(r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// One growth core answered by cn (`cn growth decide <core> --world F`): the capture's
// log names (`logname`, `parsename`) and the rest the parity face asks.
export function cnGrowth(core, input) {
  const dir = mkdtempSync(join(tmpdir(), 'acme-cn-growth-'));
  try {
    const file = join(dir, 'input.json');
    writeFileSync(file, JSON.stringify(input));
    const r = spawnSync(CN, ['growth', 'decide', core, '--world', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`cn growth decide ${core} exited ${r.status}: ${r.stderr || r.stdout}`);
    return JSON.parse(r.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// One declaration through the contract: { normalized, problems, signals, cadence, … }.
export const contractOf = (declaration, terms = {}) => cnTasks('contract', { declarations: [{ declaration, terms }] })[0];

// One precondition list over signals: { run, reason, context, … }.
export const verdictOf = (preconditions, signals, { now = null, config = {}, item = null } = {}) =>
  cnTasks('precondition', { cases: [{ preconditions, signals, config, item, ...(now ? { now } : {}) }] })[0];

// An issue body's request fields as the queue reads them: gated, the fields only an
// author with push access may set included; ungated, the two waits alone.
export const requestFieldsOf = (body, { gated = true } = {}) => {
  const [read] = cnTasks('grammar', { bodies: [body] }).bodies;
  return gated ? read.request : read.requestUngated;
};

// A task.json as the engine normalizes it, for a test reading the declaration the
// scheduler and the executor read. Throws, naming the variable, where no cn is built.
export function declarationOf(json) {
  if (!CN) throw new Error('CLAUDINITE_CN names no cn binary: the declaration is the engine\'s to normalize');
  return contractOf(json).normalized;
}

// A task directory's local terms as the contract reads them, from its preconditions.mjs:
// { name: { signals, needsItem, takesArg } }, empty where the task has none.
export async function termsOf(taskDir) {
  if (!existsSync(join(taskDir, 'preconditions.mjs'))) return {};
  const { terms = {} } = await import(pathToFileURL(join(taskDir, 'preconditions.mjs')).href);
  return Object.fromEntries(Object.entries(terms).map(([name, t]) => [name,
    { signals: t.signals ?? [], needsItem: Boolean(t.needsItem), takesArg: Boolean(t.takesArg) }]));
}

// The packs' merge rules compiled by the engine, and a policy judged over a change:
// `verdict(policy, entries)` answers { mergeable, why, files, problems } as the landing
// lane does. `packs` is [{ id, dir }], each dir's merge-rules.json read when present.
export function mergePolicy(packs) {
  const declared = packs.map(({ id, dir }) => {
    const file = join(dir, 'merge-rules.json');
    return { id, rules: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [] };
  });
  const ask = (cases) => cnTasks('policy', { packs: declared, cases });
  return {
    errors: ask([]).ruleErrors,
    verdict: (policy, entries) => ask([{ policy, entries }]).verdicts[0],
  };
}

// A task's precondition list judged with its local terms in it. cn's decision core
// asks only the built-in terms, so each alternative naming a local term is asked of
// the task's own preconditions.mjs the way the engine's runner asks it, every other
// alternative of cn alone, and the list composed as the engine composes it: every
// entry must hold, and an entry holds when any of its alternatives does. An error in
// any alternative asked is the verdict's error.
export async function verdictWithTerms(taskDir, preconditions, signals, { now = null, config = {}, item = null } = {}) {
  const local = existsSync(join(taskDir, 'preconditions.mjs'))
    ? (await import(pathToFileURL(join(taskDir, 'preconditions.mjs')).href)).terms ?? {}
    : {};
  const reasons = [];
  const context = [];
  let run = true;
  for (const entry of preconditions) {
    let holds = false;
    for (const alt of String(entry).split('||').map((s) => s.trim()).filter(Boolean)) {
      const [name, ...rest] = alt.split(':');
      let out;
      if (Object.hasOwn(local, name)) {
        try {
          out = await local[name].holds(signals, { arg: rest.length ? rest.join(':') : undefined, config, item, now: now ? new Date(now) : null }) ?? {};
          out = { run: out.holds === true, reason: out.reason, context: out.context, error: out.error };
        } catch (e) { out = { error: `threw: ${e?.message ?? e}` }; }
      } else {
        out = verdictOf([alt], signals, { now, config, item });
      }
      if (out.error) return { error: out.error };
      if (out.reason) reasons.push(out.reason);
      if (Array.isArray(out.context)) context.push(...out.context);
      holds = holds || out.run === true;
    }
    run = run && holds;
  }
  return { run, reason: reasons.join('; '), context };
}
