import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioParameters } from '../src/diagnostics/scenarioParameters.ts';
test('decimal scenario quantities are preserved rather than silently truncated', () => {
  assert.equal(scenarioParameters('Reduce carbs by 25.5 g').grams, 25.5);
  assert.equal(scenarioParameters('Walk for 30.5 minutes').duration, 30.5);
  const compound = scenarioParameters('Walk 20 minutes and reduce carbs by 12.5 g');
  assert.equal(compound.duration, 20); assert.equal(compound.grams, 12.5); assert.equal(compound.error, '');
});
test('unsupported units and out-of-bound requests are explained instead of guessed', () => {
  for (const q of ['walk 0 minutes','walk 61 minutes','walk 5 km','walk 1 hour','delay carbs 30 seconds','reduce carbs by 1 oz','reduce carbs by 2 kg','walk -5 minutes','delay carbs 90 minutes']) {
    assert.ok(scenarioParameters(q).error, q);
  }
  assert.equal(scenarioParameters('Walk for 30 minutes').error, '');
  assert.equal(scenarioParameters('Reduce carbs by 0 g').error, '');
});
