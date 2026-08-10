#!/usr/bin/env node
// End-to-end smoke test for site/index.html. Serves site/ on a random port,
// drives the real page in headless Chromium and asserts every view renders
// what the data says it should.
//
//   npm run test:page              (npx playwright install chromium once)
//   node scripts/test-page.mjs --screenshots
//
// Any console error or failed request fails the run — a silent JS error in a
// static page is exactly the kind of thing a refresh can introduce.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const SHOTS = process.argv.includes('--screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = createServer(async (req, res) => {
  const path = join(SITE, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });

// Map tiles and the optional hero photo may legitimately be absent offline;
// anything else that 404s or throws is a real failure.
const OPTIONAL = /basemaps\.cartocdn|fonts\.(googleapis|gstatic)/;
const consoleErrors = [];
page.on('console', (m) => {
  // Resource 404s are reported separately below, with the URL attached.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('requestfailed', (r) => { if (!OPTIONAL.test(r.url())) consoleErrors.push(`request failed: ${r.url()}`); });
page.on('response', (r) => {
  if (r.status() >= 400 && !OPTIONAL.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
});

const data = JSON.parse(await readFile(join(SITE, 'benefits-data.json'), 'utf8'));
await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });

// ── chrome ──────────────────────────────────────────────────────────────
ok((await page.locator('#stats li').count()) === 3, 'hero should show 3 stats');
ok((await page.locator('#stats li').first().innerText()).includes(String(data.entries.length)),
  'first hero stat should be the entry count');
ok(/Verified .+ · Next refresh /.test(await page.locator('#freshness').innerText()), 'freshness line missing');
ok(await page.locator('.cardshot img').evaluate((i) => i.complete && i.naturalWidth > 0),
  'hero card art failed to load — the placeholder fallback took over');
ok((await page.locator('.mode').count()) === 3, 'task picker should offer 3 modes');
ok(await page.locator('.mode[aria-pressed="true"] .mode__label').innerText() === 'Find a place to eat',
  'Eat should be the default mode');

// ── eat view ────────────────────────────────────────────────────────────
await page.waitForSelector('#eat-groups .pick');
const groupCount = await page.locator('#eat-groups .grouphead').count();
ok(groupCount >= 5, `expected several tier groups, got ${groupCount}`);
const firstGroupCards = await page.locator('#eat-groups > div').first().locator('.pick').count();
ok(firstGroupCards <= 3, `groups should collapse to 3 cards, got ${firstGroupCards}`);

const firstPick = page.locator('#eat-groups .pick').first();
ok((await firstPick.locator('.pick__body').count()) === 0, 'cards should start collapsed');
await firstPick.locator('.pick__btn').click();
ok((await firstPick.locator('.pick__body').count()) === 1, 'clicking a card should expand it');
ok((await firstPick.locator('.badge--type').innerText()).length > 0, 'expanded card missing its type badge');
ok((await firstPick.locator('.foot a').getAttribute('href')).startsWith('https://'), 'expanded card missing source link');
await firstPick.locator('.pick__btn').click();
ok((await firstPick.locator('.pick__body').count()) === 0, 'clicking again should collapse');

const more = page.locator('#eat-groups .morebtn').first();
const beforeMore = await page.locator('#eat-groups > div').first().locator('.pick').count();
await more.click();
ok((await page.locator('#eat-groups > div').first().locator('.pick').count()) > beforeMore, '"Show all" did not expand the group');
await page.locator('#eat-groups .morebtn').first().click();

await page.locator('.chip[data-act="occ"][data-val="date_night"]').click();
ok((await page.locator('#eat-title').innerText()).toLowerCase().includes('date night'), 'occasion chip did not retitle the list');
ok((await page.locator('#eat-groups .pick__rank').count()) > 0, 'occasion mode should rank picks');
ok((await page.locator('#map-title').innerText()).includes('Date Night'), 'map title did not follow the occasion');
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-eat.png'), fullPage: false });
await page.locator('.chip[data-act="occ"][data-val=""]').click();

// ── payback view ────────────────────────────────────────────────────────
await page.locator('.tab[data-mode="payback"]').click();
await page.waitForSelector('.pb__step');
const steps = await page.locator('.pb__step').count();
ok(steps === 8, `expected 8 break-even rows, got ${steps}`);
ok((await page.locator('.pb__total').innerText()) === 'S$1,850', `break-even total wrong: ${await page.locator('.pb__total').innerText()}`);
ok((await page.locator('.pb__step--clears').count()) === 1, 'exactly one row should be marked as clearing the fee');
ok((await page.locator('.pb__gloss').innerText()).includes('S$1,744'), 'gloss should name the annual fee');
const conditions = await page.locator('.pb__cond').allInnerTexts();
ok(conditions.every((c) => c.trim().length > 0), 'every break-even row needs a condition line');
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-payback.png') });

// ── browse view ─────────────────────────────────────────────────────────
await page.locator('.tab[data-mode="browse"]').click();
await page.waitForSelector('#browse-groups .row');
ok((await page.locator('#result-count').innerText()) === `${data.entries.length} of ${data.entries.length} benefits`,
  `unfiltered browse should list every entry, got "${await page.locator('#result-count').innerText()}"`);
ok((await page.locator('#browse-groups .grouphead').count()) === data.taxonomy.sections.length,
  'every section should have a heading');

await page.locator('#search').fill('buffet');
await page.waitForFunction(() => document.getElementById('result-count').textContent.split(' ')[0] !== '98');
const filtered = Number((await page.locator('#result-count').innerText()).split(' ')[0]);
ok(filtered > 0 && filtered < data.entries.length, `search should narrow the list, got ${filtered}`);
await page.locator('#search').fill('zzzznope');
await page.waitForSelector('#no-results:not([hidden])');
ok(await page.locator('#no-results').isVisible(), 'empty state should appear when nothing matches');

await page.locator('[data-act="reset"]').click();
ok((await page.locator('#result-count').innerText()) === `${data.entries.length} of ${data.entries.length} benefits`, 'reset did not clear the search');

await page.locator('.chip[data-act="section"][data-val="ldr"]').click();
ok((await page.locator('#browse-groups .grouphead').count()) === 1, 'section chip should show one section');

await page.selectOption('#sort', 'name_asc');
const names = await page.locator('#browse-groups .row__name').allInnerTexts();
ok(names.join('|') === [...names].sort((a, b) => a.localeCompare(b)).join('|'), 'A→Z sort did not sort');
await page.locator('[data-act="reset"]').click();

const row = page.locator('#browse-groups .row').first();
await row.locator('.row__btn').click();
ok((await row.locator('.row__body').count()) === 1, 'browse row should expand');
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-browse.png') });

// ── back to eat: the map survives the round trip ────────────────────────
await page.locator('.tab[data-mode="eat"]').click();
await page.waitForSelector('#eat-groups .pick');
ok((await page.locator('#pbg-map .leaflet-marker-pane, #pbg-map path').count()) > 0
  || (await page.locator('#pbg-map .leaflet-container, #pbg-map.leaflet-container').count()) > 0,
  'map should still be alive after leaving and returning to the Eat view');
ok(/^\d+ locations?$/.test(await page.locator('#map-count').innerText()), 'map location count lost on return');
await page.locator('.tab[data-mode="browse"]').click();
await page.waitForSelector('#browse-groups .row');

// ── methodology modal ───────────────────────────────────────────────────
await page.locator('[data-act="method-open"]').click();
await page.waitForSelector('.modal__panel');
ok((await page.locator('.modal__type').count()) === data.taxonomy.value_types.length, 'modal should define every value type');
ok((await page.locator('.modal__band').count()) === data.taxonomy.grade_bands.length, 'modal should list every grade band');
ok((await page.locator('.modal__caveats li').count()) === data.caveats.length, 'modal should list every caveat');
await page.keyboard.press('Escape');
ok((await page.locator('.modal__panel').count()) === 0, 'Escape should close the modal');

// ── theme ───────────────────────────────────────────────────────────────
const themeBefore = await page.getAttribute('html', 'data-theme');
await page.locator('#themebtn').click();
ok((await page.getAttribute('html', 'data-theme')) !== themeBefore, 'theme toggle did nothing');
await page.reload({ waitUntil: 'networkidle' });
ok((await page.getAttribute('html', 'data-theme')) !== themeBefore, 'theme choice should survive a reload');
await page.locator('#themebtn').click();

ok(consoleErrors.length === 0, `console errors:\n    ${consoleErrors.join('\n    ')}`);

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n✕ page: ${failures.length} failure(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ page: header, hero, all three views, modal and theme render correctly');
