import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
async function waitFor(page, predicate) {
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(predicate)) return;
    await page.waitForTimeout(50);
  }
  throw new Error('Workspace condition did not become true.');
}
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const base = process.env.BASE_URL || 'http://localhost:5173';
  await page.goto(base);
  await page
    .getByRole('heading', { name: 'Reproducible experiments.' })
    .waitFor();
  await page.locator('[data-action="micro-save"]').click();
  await waitFor(
    page,
    () => document.querySelectorAll('.history-panel tbody tr').length === 1
  );
  const downloaded = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await downloaded;
  const artifact = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.environment.version, 'microgrid-v1');
  assert.equal(artifact.model.q.length, 69984);
  await page.reload();
  await page
    .getByRole('heading', { name: 'Reproducible experiments.' })
    .waitFor();
  assert.equal(await page.locator('.history-panel tbody tr').count(), 1);
  await page.locator('[data-action="micro-load"]').click();
  await waitFor(
    page,
    () =>
      document.querySelector('#toast').textContent === 'Saved policy restored.'
  );
  await page.locator('[data-action="micro-delete"]').click();
  await waitFor(
    page,
    () => document.querySelectorAll('.history-panel tbody tr').length === 0
  );
  await page.locator('#import-run').setInputFiles({
    name: 'restored.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(artifact)),
  });
  await waitFor(
    page,
    () => document.querySelectorAll('.history-panel tbody tr').length === 1
  );
  const incomplete = structuredClone(artifact);
  delete incomplete.code;
  await page.locator('#import-run').setInputFiles({
    name: 'missing-metadata.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incomplete)),
  });
  await waitFor(page, () =>
    document
      .querySelector('#toast')
      .textContent.includes('Invalid experiment metadata')
  );
  assert.equal(await page.locator('.history-panel tbody tr').count(), 1);
  const forged = structuredClone(artifact);
  forged.model.evaluations.balanced.learned.objective = -1000000;
  await page.locator('#import-run').setInputFiles({
    name: 'claimed-scores.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(forged)),
  });
  await waitFor(page, () =>
    document.querySelector('#toast').textContent.includes('scores recomputed')
  );
  const verifiedDownload = page.waitForEvent('download');
  await page.locator('#export').click();
  const verifiedFile = await verifiedDownload;
  const verified = JSON.parse(
    await readFile(await verifiedFile.path(), 'utf8')
  );
  assert.equal(
    verified.model.evaluations.balanced.learned.objective,
    artifact.model.evaluations.balanced.learned.objective
  );
  assert.equal(verified.evaluation.testSeeds.length, 10);
  const invalid = { ...artifact, model: { ...artifact.model, q: [0] } };
  await page.locator('#import-run').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await waitFor(page, () =>
    document.querySelector('#toast').textContent.includes('Invalid Q-table')
  );
  assert.equal(await page.locator('.history-panel tbody tr').count(), 1);
  await page.locator('.nav-item[data-view="evaluation"]').click();
  assert.equal(await page.locator('.benchmark-table tbody tr').count(), 4);
  assert.equal(await page.locator('.study-benchmark tbody tr').count(), 3);
  assert.equal(await page.locator('.study-curves svg').count(), 2);
  assert.equal(await page.locator('.study-profiles tbody tr').count(), 3);
  assert.match(await page.locator('.study-benchmark').innerText(), /400,512/);
  assert.match(
    await page.locator('main').innerText(),
    /different training budgets/
  );
  await page.locator('.nav-item[data-view="diagnostics"]').click();
  assert.equal(await page.locator('.report-grid tbody tr').count(), 9);
  assert.equal(await page.locator('.cost-breakdown tbody tr').count(), 5);
  assert.match(
    await page.locator('main').innerText(),
    /quarter-hour-observation/
  );
  for (const view of [
    'experiments',
    'evaluation',
    'diagnostics',
    'microgrid',
  ]) {
    await page.locator('.nav-item[data-view="' + view + '"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      ),
      false,
      'mobile overflow in ' + view
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: persistence across reload, policy restoration, export/import, malformed artifact rejection, benchmark reports, diagnostics, mobile views, and clean console.'
  );
} finally {
  await browser.close();
}
