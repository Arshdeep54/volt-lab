import { scenePalette } from '../src/scene-theme.mjs';
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
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  await page
    .getByRole('heading', { name: 'Small decisions. Smarter energy.' })
    .waitFor();
  assert.equal(await page.locator('.q-values div').count(), 3);
  const skies = [];
  for (const [replayHour, phase] of [
    [0, 'night'],
    [6, 'dawn'],
    [12, 'day'],
    [18, 'dusk'],
    [23, 'night'],
  ]) {
    const slider = page.getByRole('slider', { name: 'Replay hour' });
    await slider.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < replayHour; i++)
      await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await page.locator('.scene-' + phase).waitFor({ timeout: 3000 });
    if (replayHour === 0) {
      await waitFor(page, 
        ({ from, to }) => {
          const shown = document
            .querySelector('.scene')
            .style.getPropertyValue('--scene-sky-top');
          return shown !== from && shown !== to;
        },
        {
          from: scenePalette(12)['--scene-sky-top'],
          to: scenePalette(0)['--scene-sky-top'],
        },
        { timeout: 2000 }
      );
    }

    await waitFor(page, 
      (color) =>
        document
          .querySelector('.scene')
          .style.getPropertyValue('--scene-sky-top') === color,
      scenePalette(replayHour)['--scene-sky-top']
    );
    skies.push(
      await page
        .locator('.scene')
        .evaluate((el) => getComputedStyle(el).backgroundImage)
    );
  }
  assert.equal(new Set(skies).size, 4);
  const slider = page.getByRole('slider', { name: 'Replay hour' });
  await slider.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');

  await page
    .getByRole('button', { name: 'Step one hour', exact: true })
    .click();
  assert.match(await page.locator('.scene-time').innerText(), /13:00/);
  await page.locator('#controller').selectOption('rule');
  await page.locator('#weather').selectOption('cloudy');
  assert.match(await page.locator('.scene-weather').innerText(), /Cloudy/);
  await page.locator('.nav-item[data-view="training"]').click();
  await page.locator('#seed').selectOption('43');
  await page.locator('.form-panel [data-action="train"]').click();
  await page.locator('[data-action="pause"]').click();
  assert.match(await page.locator('.training-status').innerText(), /paused/);
  // Evaluation must not display results for a partially trained policy.
  await page.locator('.nav-item[data-view="results"]').click();
  await page
    .getByRole('heading', { name: 'Let the experiment finish.' })
    .waitFor();
  assert.match(await page.locator('.metrics').innerText(), /Pending/);
  await page.locator('[data-action="pause"]').click();
  await page
    .getByRole('heading', { name: 'Does the learned policy hold up?' })
    .waitFor({ timeout: 15000 });
  await page.locator('.nav-item[data-view="results"]').click();
  assert.match(await page.locator('.bar-list').innerText(), /30.79/);
  await page.locator('[data-action="benchmark"]').click();
  await waitFor(page, 
    () =>
      document
        .querySelector('main')
        ?.textContent.includes('Five independent training runs'),
    null,
    { timeout: 20000 }
  );
  assert.equal(await page.locator('tbody tr').count(), 5);
  const downloaded = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloaded;
  const artifact = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(artifact.run.seed, 43);
  assert.equal(artifact.run.q.length, 2376);
  assert.equal(artifact.benchmarks.length, 5);
  await page.locator('.nav-item[data-view="architecture"]').click();
  assert.equal(await page.locator('.flow-node').count(), 3);
  await page.locator('.nav-item[data-view="glossary"]').click();
  assert.equal(await page.locator('.glossary-card').count(), 29);
  await page.locator('#search').fill('Bellman');
  assert.equal(await page.locator('.glossary-card').count(), 1);
  await page.locator('.nav-item[data-view="overview"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: replay, controller/weather controls, training pause/resume, pending evaluation, five-seed benchmark, JSON export, architecture, glossary, mobile layout, and clean console.'
  );
} finally {
  await browser.close();
}
