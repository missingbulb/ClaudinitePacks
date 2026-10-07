import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLadder, dayKey } from '../src/derive/days.mjs';

const NOW = Date.parse('2026-08-18T12:00:00Z');

test('the ladder is UTC days, oldest first, ending today', () => {
  const days = dayLadder(NOW, 3);
  assert.deepEqual(days, ['2026-08-16', '2026-08-17', '2026-08-18']);
  assert.equal(dayKey(NOW), '2026-08-18');
});
