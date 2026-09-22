import test from 'node:test';
import assert from 'node:assert/strict';
import { scenePalette, blendPalettes } from '../src/scene-theme.mjs';

const channels = (color) => color.match(/\d+/g).map(Number);
test('sky changes gradually throughout dawn and dusk, and wraps at midnight', () => {
  assert.deepEqual(scenePalette(0), scenePalette(24));
  for (const start of [3, 15]) {
    const colors = Array.from(
      { length: 8 },
      (_, i) => scenePalette(start + i)['--scene-sky-top']
    );
    assert.ok(new Set(colors).size > 4);
    for (let i = 1; i < colors.length; i++) {
      const before = channels(colors[i - 1]),
        after = channels(colors[i]);
      assert.ok(
        after.every((v, channel) => Math.abs(v - before[channel]) < 80)
      );
    }
  }
});
test('fractional hours blend between their neighboring hourly colors', () => {
  const before = channels(scenePalette(5)['--scene-sky-top']);
  const after = channels(scenePalette(6)['--scene-sky-top']);
  const halfway = channels(scenePalette(5.5)['--scene-sky-top']);
  assert.ok(
    halfway.every((v, i) => Math.abs(v - (before[i] + after[i]) / 2) <= 1)
  );
});
test('animation blends from the displayed palette to the new one', () => {
  const from = scenePalette(0),
    to = scenePalette(12);
  assert.deepEqual(blendPalettes(from, to, 0), from);
  assert.deepEqual(blendPalettes(from, to, 1), to);
  assert.notDeepEqual(blendPalettes(from, to, 0.5), to);
  assert.equal(blendPalettes(from, to, 0.5)['--scene-night-opacity'], 0.5);
});
