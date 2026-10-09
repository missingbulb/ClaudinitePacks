// The verify-in-production skill (#1091) rides the request lane — the queue is the
// delayed-execution mechanism, so the skill's whole contract is prose. What is
// tested is that the two templates it prescribes are ones the queue's own parsers
// read back; the Not-before adoption carry it leans on is engine behaviour, tested
// in the engine's own queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(join(here, '../skills/verify-in-production/SKILL.md'), 'utf8');

// The two templates are the fenced blocks that open on the original issue: one
// coded (probes a worker fetches), one agentic (a GitHub read a session makes).
const templates = [...skill.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => b.startsWith('Original-issue:'));

test('the skill prescribes one coded template and one agentic one', () => {
  assert.equal(templates.length, 2, 'a third would be a form nobody defined');
});
