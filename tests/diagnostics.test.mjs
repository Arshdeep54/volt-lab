import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { micro } from '../src/microgrid-controller.mjs';
import { loadReports, diagnosticsView } from '../src/ui/workspace-views.mjs';

test('diagnostics highlight the policy tie break rather than the first maximum', async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = micro.model,
    originalLatest = micro.latest;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      JSON.parse(
        await readFile(
          new URL(
            '../experiments/results/' + url.split('/').at(-1),
            import.meta.url
          ),
          'utf8'
        )
      ),
  });
  try {
    await loadReports();
    micro.model = { q: Array(9).fill(0) };
    micro.latest = { state: 0 };
    assert.match(
      diagnosticsView(),
      /class="selected-action"><td>Idle<\/td><td>Off<\/td>/
    );
  } finally {
    globalThis.fetch = originalFetch;
    micro.model = originalModel;
    micro.latest = originalLatest;
  }
});
