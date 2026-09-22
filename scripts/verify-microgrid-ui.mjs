import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function waitFor(page, predicate, argument, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, argument)) return;
    await page.waitForTimeout(50);
  }
  throw new Error('Browser condition did not become true within ' + timeout + 'ms');
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const base = process.env.BASE_URL || 'http://localhost:5173';
  await page.goto(base + '/?lab=microgrid');
  await page
    .getByRole('heading', { name: 'A whole home. More decisions.' })
    .waitFor();
  assert.equal(await page.locator('.micro-meters > div').count(), 5);
  await page.locator('[data-action="micro-step"]').click();
  assert.match(await page.locator('.scene-time').innerText(), /00:15/);
  await page.locator('[data-action="micro-play"]').click();
  await waitFor(page, () =>
    document.querySelector('.scene-time').textContent.includes('00:30')
  );
  await page.locator('[data-action="micro-play"]').click();
  for (const speed of ['500', '250']) {
    await page.locator('[data-action="micro-reset"]').click();
    await page.locator('#micro-speed').selectOption(speed);
    await page.locator('[data-action="micro-play"]').click();
    await waitFor(page, () => document.querySelector('.scene-time').textContent.includes('00:45'));
    await page.locator('[data-action="micro-play"]').click();
    assert.equal(await page.locator('#micro-speed').inputValue(), speed);
  }
  await page.locator('[data-action="micro-outage"]').click();
  assert.match(
    await page.locator('.panel-head .pill').first().innerText(),
    /GRID OUTAGE/
  );
  assert.match(
    await page.locator('.micro-meters').innerText(),
    /Outage · 0 kW available/
  );
  await page.locator('[data-action="micro-departure"]').click();
  assert.match(await page.locator('.scene-time').innerText(), /06:45/);
  assert.match(
    await page.locator('.micro-event-feed').innerText(),
    /Departure/
  );
  await page.locator('#micro-profile').selectOption('cloudy');
  await page.locator('#micro-controller').selectOption('rule');
  await page.locator('#micro-scenario').selectOption('920000003');
  assert.match(await page.locator('.scene-time').innerText(), /00:00/);
  const previousEvaluation = await page
    .locator('.micro-evaluation')
    .innerText();
  await page.locator('#micro-budget').selectOption('3000');
  await page.locator('[data-action="micro-train"]').click();
  await page.locator('[data-action="micro-pause"]').click();
  assert.equal(await page.locator('#micro-budget').isDisabled(), true);
  assert.equal(await page.locator('#micro-train-seed').isDisabled(), true);
  assert.equal(
    await page.locator('.micro-evaluation').innerText(),
    previousEvaluation
  );
  await page.locator('[data-action="micro-pause"]').click();
  await waitFor(page, 
    () => !document.querySelector('[data-action="micro-pause"]'),
    null,
    { timeout: 45000 }
  );
  assert.match(
    await page.locator('.micro-bottom .panel-subtitle').first().innerText(),
    /3,000 episodes/
  );
  const downloaded = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloaded;
  const artifact = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(artifact.model.episodes, 3000);
  assert.equal(artifact.model.q.length, 69984);
  assert.equal(artifact.telemetry.length, 1);
  assert.equal(artifact.scenario.seed, 920000003);
  assert.equal(artifact.scenario.controller, 'rule');
  assert.ok(Math.abs(artifact.model.evaluations.cloudy.learned.departures - 7) < 1e-9);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-action="micro-share"]').click();
  const url = new URL(
    await page.evaluate(() => navigator.clipboard.readText())
  );
  assert.equal(url.searchParams.get('scenario'), '920000003');
  assert.equal(url.searchParams.get('profile'), 'cloudy');
  await page.goto(url.href);
  await page
    .getByRole('heading', { name: 'A whole home. More decisions.' })
    .waitFor();
  assert.equal(await page.locator('#micro-scenario').inputValue(), '920000003');
  assert.equal(await page.locator('#micro-profile').inputValue(), 'cloudy');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: live physics, joint controls, outage and departure events, actual training pause/resume, stable evaluation during training, model export, scenario sharing, mobile layout, and clean console.'
  );
} finally {
  await browser.close();
}
