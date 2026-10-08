import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskDeclaration } from '../src/derive/declaration-text.mjs';

test('a text that is not a declaration object stays what it is', () => {
  for (const text of ['[1]', 'null', '"s"']) assert.deepEqual(parseTaskDeclaration(text), JSON.parse(text));
});
