import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrogridEnv, generateMicrogrid } from '../src/microgrid.mjs';
import { micro, microgridTick } from '../src/microgrid-view.mjs';

test('playback advances every physics interval at 1×, 2×, and 4× despite 100ms polling', () => {
  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  try {
    for (const [speed, steps] of [[1000, 1], [500, 2], [250, 4]]) {
      micro.env = new MicrogridEnv(generateMicrogrid(42));
      micro.model = { q: new Float32Array(7776 * 9) };
      micro.latest = null;
      micro.events = [];
      micro.controller = 'learned';
      micro.speed = speed;
      micro.lastTick = 0;
      micro.running = true;
      let renders = 0;
      for (now = 100; now <= 1000; now += 100) microgridTick(() => renders++);
      assert.equal(micro.env.t, steps, 'intervals for ' + speed + 'ms playback');
      assert.equal(renders, steps);
      micro.running = false;
      now = 2000;
      microgridTick(() => renders++);
      assert.equal(micro.env.t, steps, 'paused playback stays still');
    }
  } finally {
    Date.now = originalNow;
  }
});
