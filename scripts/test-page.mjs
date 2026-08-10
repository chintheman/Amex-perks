#!/usr/bin/env node
// End-to-end smoke test for site/index.html. Serves site/ on a random port,
// drives the real page in headless Chromium and asserts every view renders
// what the data says it should.
//
//   npm run test:page              (npx playwright install chromium once)
//   node scripts/test-page.mjs --screenshots
//
// Any console error, failed request or duplicate element id fails the run — a
// silent JS error in a static page is exactly the kind of thing a refresh can
// introduce, and a duplicate id is how the two maps once stole each other's
// container.

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
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const path = join(SITE, rel === '/' ? 'index.html' : rel);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });

// Map tiles and fonts may legitimately be absent offline; anything else that
// 404s or throws is a real failure.
const OPTIONAL = /basemaps\.cartocdn|fonts\.(googleapis|gstatic)/;
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push((e.stack || String(e)).split('\n').slice(0, 5).join('\n      ')));
page.on('requestfailed', (r) => { if (!OPTIONAL.test(r.url())) consoleErrors.push(`request failed: ${r.url()}`); });
page.on('response', (r) => { if (r.status() >= 400 && !OPTIONAL.test(r.url())) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });

const dupeIds = () => page.evaluate(() => {
  const seen = {};
  for (const el of document.querySelectorAll('[id]')) seen[el.id] = (seen[el.id] || 0) + 1;
  return Object.entries(seen).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
});

const data = JSON.parse(await readFile(join(SITE, 'benefits-data.json'), 'utf8'));
const benefits = data.entries.filter((e) => e.kind === 'benefit');
const venues = data.entries.filter((e) => e.kind === 'venue');
const filtered = data.scenarios.filter((s) => !s.view);

await page.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.scen');

// ── header + hero ───────────────────────────────────────────────────────
ok((await page.locator('#stats li').count()) === 3, 'hero should show 3 stats');
ok((await page.locator('#stats li').first().innerText()).includes(String(benefits.length)),
  'first hero stat should be the benefit count');
ok(/Verified .+ · Next refresh /.test(await page.locator('#freshness').innerText()), 'freshness line missing');
ok(await page.locator('.cardshot img').evaluate((i) => i.complete && i.naturalWidth > 0),
  'hero card art failed to load — the placeholder fallback took over');
// The break-even figure is the reason the product exists, so it is in the hero.
ok(/^S\$[\d,]+ claimable$/.test(await page.locator('#fee-big').innerText()),
  `fee headline wrong: ${await page.locator('#fee-big').innerText()}`);
ok((await page.locator('#fee-note').innerText()).includes('S$1,744'), 'fee note should name the annual fee');
ok(Number((await page.locator('#fee-fill').evaluate((el) => el.style.width)).replace('%', '')) > 0,
  'fee progress bar never filled');

// ── home: scenarios ─────────────────────────────────────────────────────
ok((await page.locator('.scen').count()) === data.scenarios.length,
  `expected ${data.scenarios.length} scenario tiles`);
const tileCounts = await page.locator('.scen__n').allInnerTexts();
ok(tileCounts.filter((t) => /^\d+ options?/.test(t)).length === filtered.length,
  'every filtering scenario should show how many options it leads to');
ok(!tileCounts.some((t) => /^0 options/.test(t)), 'a scenario leading nowhere must never ship');

// ── home: benefits grouped by effort ────────────────────────────────────
ok((await page.locator('.effhead').count()) === data.taxonomy.efforts.length,
  'every effort group should have a heading');
ok((await page.locator('#ben-count').innerText()) === `${benefits.length} benefits · ${venues.length} places to use them`,
  `benefit count line wrong: ${await page.locator('#ben-count').innerText()}`);

const firstBen = page.locator('.ben').first();
ok((await firstBen.locator('.ben__body').count()) === 0, 'benefit cards should start collapsed');
await firstBen.locator('.ben__btn').click();
ok((await firstBen.locator('.ben__body').count()) === 1, 'clicking a benefit should expand it');
ok((await firstBen.locator('.foot a').getAttribute('href')).startsWith('https://'), 'expanded benefit missing its Amex source');
await firstBen.locator('.ben__btn').click();

const moreBtn = page.locator('[data-act="more-effort"]').first();
if (await moreBtn.count()) {
  const before = await page.locator('.ben').count();
  await moreBtn.click();
  ok((await page.locator('.ben').count()) > before, '"Show all" did not expand the effort group');
  await page.locator('[data-act="more-effort"]').first().click();
}
ok((await dupeIds()).length === 0, `duplicate element ids on home: ${(await dupeIds()).join(', ')}`);
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-home.png') });

// ── a scenario, end to end ──────────────────────────────────────────────
await page.locator('.scen').first().click();
await page.waitForSelector('#view-results:not([hidden])');
const scenario = filtered[0];
ok((await page.locator('#res-title').innerText()) === scenario.label, 'results title should name the scenario');
ok((await page.locator('#res-blurb').innerText()) === scenario.blurb, 'results should explain why these results');
const resultCount = Number((await page.locator('#res-count').innerText()).split(' ')[0]);
ok(resultCount > 0, 'scenario returned nothing');
ok((await page.locator('#res-list .pick, #res-list .ben').count()) === resultCount, 'result count disagrees with cards rendered');
// This scenario ranks by occasion fit, so the cards carry positions.
ok((await page.locator('#res-list .pick__rank').count()) > 0, 'a ranked scenario should number its results');
await page.waitForSelector('#results-map path.leaflet-interactive');
ok((await page.locator('#results-map path.leaflet-interactive').count()) > 0, 'results map has no markers');
ok((await dupeIds()).length === 0, `duplicate element ids in results: ${(await dupeIds()).join(', ')}`);
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-scenario.png') });

await page.locator('.backbtn').first().click();
await page.waitForSelector('#view-home:not([hidden])');

// ── drilling from a parent benefit into its venues ──────────────────────
const parent = benefits.find((b) => data.entries.some((e) => e.parent === b.id));
const childCount = data.entries.filter((e) => e.parent === parent.id).length;
await page.locator('.tab[data-view="home"]').click();
await page.evaluate((id) => {
  const btn = [...document.querySelectorAll('.ben__btn')].find((b) => b.dataset.id === id);
  if (btn) btn.click();
}, parent.id);
const openBtn = page.locator(`[data-act="parent"][data-id="${parent.id}"]`);
if (await openBtn.count()) {
  await openBtn.click();
  await page.waitForSelector('#view-results:not([hidden])');
  ok((await page.locator('#res-title').innerText()) === parent.name, 'drill-down should be titled after the parent benefit');
  ok(Number((await page.locator('#res-count').innerText()).split(' ')[0]) === childCount,
    `parent should list all ${childCount} of its venues`);
  await page.locator('.tab[data-view="home"]').click();
} else {
  failures.push(`no drill-down button rendered for parent benefit ${parent.id}`);
}

// ── places view ─────────────────────────────────────────────────────────
await page.locator('.tab[data-view="places"]').click();
await page.waitForSelector('#places-groups .grouphead');
const diningVenues = venues.filter((e) => e.category === 'dining').length;
ok((await page.locator('#places-count').innerText()) === `${diningVenues} venues`,
  `places should list every dining venue, got "${await page.locator('#places-count').innerText()}"`);
await page.waitForSelector('#places-map path.leaflet-interactive');
ok((await page.locator('#places-map path.leaflet-interactive').count()) > 0, 'places map has no markers');
ok((await dupeIds()).length === 0, `duplicate element ids in places: ${(await dupeIds()).join(', ')}`);

await page.locator('.chip[data-act="occ"][data-val="date_night"]').click();
ok((await page.locator('#map-title').innerText()).includes('Date Night'), 'occasion chip did not retitle the map');
ok((await page.locator('.pick__rank').count()) > 0, 'occasion mode should rank venues');
await page.locator('.chip[data-act="occ"][data-val=""]').click();

await page.locator('#search').fill('buffet');
await page.waitForFunction((total) => document.getElementById('places-count').textContent.split(' ')[0] !== String(total), diningVenues);
const searched = Number((await page.locator('#places-count').innerText()).split(' ')[0]);
ok(searched > 0 && searched < diningVenues, `search should narrow the list, got ${searched}`);
await page.locator('#search').fill('zzzznope');
await page.waitForSelector('#places-empty:not([hidden])');
ok(await page.locator('#places-empty').isVisible(), 'empty state should appear when nothing matches');
await page.locator('#search').fill('');
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-places.png') });

// ── payback ─────────────────────────────────────────────────────────────
await page.locator('.tab[data-view="payback"]').click();
await page.waitForSelector('.pb__step');
ok((await page.locator('.pb__step').count()) === 8, `expected 8 break-even rows, got ${await page.locator('.pb__step').count()}`);
ok((await page.locator('.pb__total').innerText()) === 'S$1,850', `break-even total wrong: ${await page.locator('.pb__total').innerText()}`);
ok((await page.locator('.pb__step--clears').count()) === 1, 'exactly one row should be marked as clearing the fee');
const conditions = await page.locator('.pb__cond').allInnerTexts();
ok(conditions.every((c) => c.trim().length > 0), 'every break-even row needs a condition line');
if (SHOTS) await page.screenshot({ path: join(ROOT, 'docs/shot-payback.png') });

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
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.scen');
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
console.log('✓ page: hero, scenarios, benefits by effort, drill-down, places, payback, modal and theme all render correctly');
