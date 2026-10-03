import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onFailOf } from '../../tasks/usage-review/read-live.mjs';

test('onFailOf reads on_fail, then the retired severity spelling, and leaves neither unknown', () => {
  assert.equal(onFailOf({ on_fail: 'block' }), 'block');
  assert.equal(onFailOf({ on_fail: 'advise', severity: 'blocking' }), 'advise');
  assert.equal(onFailOf({ severity: 'blocking' }), 'block');
  assert.equal(onFailOf({ severity: 'advisory' }), 'advise');
  assert.equal(onFailOf({ on_fail: 'off' }), null);
  assert.equal(onFailOf({}), null);
});
