import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskDeclaration, applyTaskDefaults } from '../src/derive/declaration-text.mjs';
import { contractOf, needsCn } from '../../../tools/test/cn-tasks.mjs';

// THE DRIFT GUARD for `src/derive/declaration-text.mjs`, the dashboard's own copy of
// the engine's declaration reader and defaults. The split is forced — the page reads a
// member's task.json in a browser, where cn cannot run — so the copy is run over the
// same texts as the engine's contract, and the defaults it fills must be the ones the
// engine fills.

const TEXTS = [
  '{}', '{"$schema":"x","id":"a"}', '{"agent_model":"opus"}', '{"expected_outcome":"no_code_changes"}',
  '{"expected_outcome":"fresh_pr","automerge":"anything"}', '{"expected_outcome":"fresh_pr"}',
  '{"preconditions":["schedule:at-most-weekly"]}',
];

const DEFAULTED = ['agent_model', 'automerge'];

test('the dashboard fills a declaration\'s defaults exactly as the engine does', needsCn, () => {
  const diffs = [];
  for (const text of TEXTS) {
    const page = applyTaskDefaults(parseTaskDeclaration(text));
    const engine = contractOf(JSON.parse(text)).normalized;
    for (const key of DEFAULTED) {
      if (JSON.stringify(page[key]) !== JSON.stringify(engine[key])) diffs.push(`${key} of ${text}: page ${JSON.stringify(page[key])} engine ${JSON.stringify(engine[key])}`);
    }
    if ('$schema' in page) diffs.push(`$schema kept from ${text}`);
  }
  assert.deepEqual(diffs, []);
});

test('a text that is not a declaration object stays what it is', () => {
  for (const text of ['[1]', 'null', '"s"']) assert.deepEqual(parseTaskDeclaration(text), JSON.parse(text));
});
