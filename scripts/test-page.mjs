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
//
// Reduced motion is forced for the whole run. The hero and tally numerals
// count up over ~900ms, so reading them mid-animation returns an intermediate
// frame; under `prefers-reduced-motion` they render their final value on the
// first paint, which is both what an assertion needs and what the reader asked
// for. Motion itself is asserted separately at the end.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const SHOTS = process.argv.includes('--screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

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

const data = JSON.parse(await readFile(join(SITE, 'benefits-data.json'), 'utf8'));
const core = await import(new URL('../site/guide-core.js', import.meta.url));
const hydrated = core.hydrate(data);
const benefits = hydrated.benefits;
const venues = hydrated.venues;
const diningVenues = venues.filter((e) => e.category === 'dining').length;
// One scenario routes to a view instead of filtering; the rest produce results.
const filtering = data.scenarios.filter((s) => !s.view);
const fee = data.card.annual_fee_sgd;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();

const OPTIONAL = /basemaps\.cartocdn|fonts\.(googleapis|gstatic)|cdnjs\.cloudflare/;
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
const text = (sel) => page.locator(sel).first().innerText();
const shot = (name) => (SHOTS ? page.screenshot({ path: join(ROOT, `docs/shot-${name}.png`), fullPage: true }) : Promise.resolve());

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForSelector('.scen');

// ─────────────────────────────────────────────────────────── masthead + shell
ok((await page.locator('.mast__name').innerText()).includes('AMEX PLATINUM'), 'masthead name missing');
ok(/verified /i.test(await text('#mast-sub')), 'masthead verification line missing');

// Exactly one node per tab. The phone bottom bar is the same nav moved by CSS,
// not a second copy: duplicating it would make every strict-mode tab selector
// below ambiguous and mint duplicate ids.
for (const v of ['home', 'places', 'year']) {
  ok(await page.locator(`.tab[data-view="${v}"]`).count() === 1, `expected exactly one .tab[data-view=${v}]`);
}
ok(await page.locator('.tab').count() === 3, 'expected three tabs, not four: break even merged into Your year');
ok(await page.locator('[data-view="payback"]').count() === 0, 'the payback view should no longer exist');
ok(await page.locator('#view-payback').count() === 0, 'the payback section should no longer exist');
ok(await page.locator('.tab[data-view="home"]').getAttribute('aria-current') === 'page', 'home tab not marked current');

// ────────────────────────────────────────────────────────────────────── hero
const pb = core.paybackView(hydrated);
ok(await text('#hero-num') === core.fmtMoney(pb.totalSgd), `hero numeral should be ${core.fmtMoney(pb.totalSgd)}`);
ok((await text('#hero-sub')).includes(core.fmtMoney(fee)), 'hero should name the fee');
ok((await text('#hero-lede')).length > 30, 'hero lede missing');
// No em or en dashes in copy we author. validate.mjs polices the JSON but
// never sees index.html, so the page's own chrome is checked here. Amex's
// wording quoted in `details` is deliberately out of scope, the same exemption
// the validator makes: a source quote is not edited to satisfy a style rule.
// `.li__gist` is excluded on purpose: it is built from each entry's `summary`,
// which is the first sentence of Amex's own `details`, so a dash there belongs
// to the source and not to us.
const CHROME = '.eyebrow, .label, .count, .act, .tab, .mast__sub, h2, h3, .hero__lede,'
  + ' .hero__sub, .urg__txt, .tally__gloss, .since__line, .note, .empty, .ink__body,'
  + ' .li__v, .scen__label, .head__blurb';
const dashes = await page.evaluate((sel) => [...document.querySelectorAll(sel)]
  .map((el) => el.textContent || '')
  .filter((t) => /(?<![0-9])[–—]|[–—](?![0-9])/.test(t))
  .map((t) => t.trim().slice(0, 60)), CHROME);
ok(dashes.length === 0, `authored copy contains a dash: ${dashes.slice(0, 3).join(' | ')}`);

// ───────────────────────────────────────────────────────────────── urgent two
const urgent = core.urgentTwo(hydrated, {});
const urgentRows = await page.locator('.urg__row').count();
ok(urgentRows === [urgent.expiring, urgent.unclaimed].filter(Boolean).length, 'urgent two row count wrong');
if (urgent.expiring) {
  ok((await page.locator('.urg__txt').first().innerText()).toLowerCase().includes('end soon'), 'expiring row copy missing');
  // The window is 90 days, deliberately narrower than the "Ending soon"
  // scenario, so these two counts should NOT agree.
  const scenCount = core.runScenario(hydrated, data.scenarios.find((s) => s.key === 'ending-soon')).length;
  ok(urgent.expiring.count <= scenCount, 'the 90 day window should never exceed the full scenario');
}

// ─────────────────────────────────────────────────────────────── scenarios
ok(await page.locator('.scen').count() === data.scenarios.length, `desktop should show all ${data.scenarios.length} scenarios`);
const scenNums = await page.locator('.scen__n').allInnerTexts();
for (const s of filtering) {
  const n = core.runScenario(hydrated, s).length;
  ok(scenNums.includes(String(n)), `scenario "${s.label}" should show its real count ${n}`);
  ok(n > 0, `scenario "${s.label}" matches nothing`);
}
ok(scenNums.some((t) => /the plan/i.test(t)), 'the fee scenario should route to the plan');

// ──────────────────────────────────────────────────────────────────── ledger
ok((await text('#ben-count')) === `${benefits.length} BENEFITS · ${venues.length} PLACES`
  || (await text('#ben-count')).toLowerCase() === `${benefits.length} benefits · ${venues.length} places`,
'ledger count line should name benefits and places');
ok(await page.locator('#effgroups .li').count() > 0, 'ledger rendered no rows');
// A quarter of the data has no number. Those rows must still carry a value.
const blanks = await page.evaluate(() => [...document.querySelectorAll('#effgroups .li')]
  .filter((r) => !r.querySelector('.li__v')?.textContent.trim()).length);
ok(blanks === 0, 'a ledger row rendered an empty value column');
const phrases = await page.locator('#effgroups .li__v--phrase').count();
ok(phrases > 0, 'no italic phrase values rendered for the unpriced rows');
ok(await dupeIds().then((d) => d.length === 0), 'duplicate ids on home');
await shot('home');

// ─────────────────────────────────────────────────────── results, in place
await page.locator('.scen').first().click();
await page.waitForSelector('#view-results:not([hidden])');
const firstScen = data.scenarios[0];
const firstRows = core.runScenario(hydrated, firstScen);
ok(await text('#res-title') === firstScen.label, 'results title should be the scenario label');
ok((await text('#res-count')).startsWith(String(firstRows.length)), `results count should be ${firstRows.length}`);
ok(await page.locator('#res-list .li').count() === firstRows.length, 'results row count differs from the filter');
ok(await page.locator('.li__idx').count() > 0, 'ranked scenario should number its rows');

// Expanding happens inside the row, and mints a per-view id so the same entry
// opened on two views can never collide.
ok(await page.locator('#res-list .det').count() === 0, 'a result was expanded before being clicked');
await page.locator('#res-list .li').first().click();
await page.waitForSelector('#res-list .det');
ok(await page.locator('#res-list .det').count() === 1, 'clicking a row should expand exactly one');
ok((await page.locator('.det__body').first().innerText()).length > 20, 'expanded row has no detail text');
ok(await page.locator('.det__terms a').first().getAttribute('href') !== null, 'expanded row has no source link');
ok(await page.locator('.li[aria-expanded="true"]').count() === 1, 'aria-expanded not set on the open row');
ok(await dupeIds().then((d) => d.length === 0), 'duplicate ids on results');
await shot('scenario');

// A drill-down from a parent benefit reaches the same view.
await page.locator('.tab[data-view="home"]').click();
await page.waitForSelector('#view-home:not([hidden])');
const parent = benefits.filter((b) => b.childCount).sort((a, b) => b.childCount - a.childCount)[0];
await page.evaluate((id) => {
  document.querySelector(`#effgroups .li[data-id="${id}"]`)?.click();
}, parent.id);
await page.waitForTimeout(150);
if (await page.locator(`[data-act="parent"][data-id="${parent.id}"]`).count()) {
  await page.locator(`[data-act="parent"][data-id="${parent.id}"]`).click();
  await page.waitForSelector('#view-results:not([hidden])');
  ok(await text('#res-title') === parent.name, 'drill-down title should be the parent benefit');
  ok(await page.locator('#res-list .li').count() === parent.childCount, 'drill-down should list every child');
  ok(await dupeIds().then((d) => d.length === 0), 'duplicate ids on drill-down');
}

// ──────────────────────────────────────────────────────────────────── places
await page.locator('.tab[data-view="places"]').click();
await page.waitForSelector('#view-places:not([hidden])');
ok((await text('#places-count')).startsWith(String(diningVenues)), `places should count ${diningVenues} tables`);
ok(await page.locator('#places-groups .li').count() > 0, 'places rendered no rows');
ok(await page.locator('.search input').count() === 1, 'search should be a ruled line with one input');

// The occasion filter is text, not chips, and re-ranks the list.
await page.locator('.occ__o[data-val="date_night"]').click();
await page.waitForTimeout(150);
ok(await page.locator('.occ__o[data-val="date_night"]').getAttribute('aria-pressed') === 'true', 'occasion not marked pressed');
ok((await text('#map-title')).toLowerCase().includes('date night'), 'map title should follow the occasion');
await page.locator('.occ__o[data-val=""]').click();
await page.waitForTimeout(150);

// The map lives behind a toggle rather than always being mounted.
ok(await page.locator('#places-map').isVisible() === false, 'map should start closed');
await page.locator('#view-places [data-act="map"]').first().click();
await page.waitForTimeout(400);
ok(await page.locator('#places-map').isVisible(), 'map did not open');
await page.waitForSelector('#places-map path.leaflet-interactive', { timeout: 15000 }).catch(() => {});
ok(await page.locator('#places-map path.leaflet-interactive').count() > 0, 'map opened with no markers');
ok(await dupeIds().then((d) => d.length === 0), 'duplicate ids on places');
await shot('places');

await page.locator('#search').fill('zzzznotathing');
await page.waitForTimeout(200);
ok(await page.locator('#places-empty').isVisible(), 'empty state missing for a search that matches nothing');
await page.locator('#search').fill('');
await page.waitForTimeout(200);

// ─────────────────────────────────────────────── your year: the three states
await page.locator('.tab[data-view="year"]').click();
await page.waitForSelector('#view-year:not([hidden])');
const plan = core.planProgress(hydrated, {});
ok(await page.locator('#view-year .li').count() === plan.length, `the plan should show ${plan.length} steps`);
ok((await text('.tally__gloss')).includes(core.fmtMoney(fee)), 'empty state should name the fee');
ok(await page.locator('#tab-year-n').isVisible() === false, 'year badge should be hidden with nothing logged');
ok(await page.locator('#log-reset').isVisible() === false, 'reset should be hidden with nothing logged');

// Part way: the numeral reports the log, one plan row goes partial.
const step0 = data.payback_path.steps[0];
await page.evaluate(([id, n]) => localStorage.setItem('pbg-log-v1', JSON.stringify({ [id]: n })), [step0.ref, 3]);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.tab[data-view="year"]').click();
await page.waitForSelector('#view-year:not([hidden])');
const partial = core.logSummary(hydrated, { [step0.ref]: 3 });
ok(await text('.tally__num') === core.fmtMoney(partial.totalSgd), `tally should read ${core.fmtMoney(partial.totalSgd)}`);
ok(/to go/.test(await text('.tally__gloss')), 'partial state should say how much is left');
ok(await page.locator('#tab-year-n').isVisible(), 'year badge should appear once something is logged');
ok(await page.locator('.bar span').count() === 2, 'before the fee the bar is two segments');
ok(await page.locator('#log-reset').isVisible(), 'reset should appear once something is logged');
const gists = await page.locator('#view-year .li__gist').allInnerTexts();
ok(gists.some((g) => /down,/.test(g)), 'a partly-used plan step should read as part done');

// Past break even: the gloss flips, the bar grows a champagne overflow and a
// fee tick, and the denominator changes from the fee to the total.
await page.evaluate((steps) => {
  const log = {};
  for (const s of steps) log[s.ref] = s.uses || 1;
  localStorage.setItem('pbg-log-v1', JSON.stringify(log));
}, data.payback_path.steps);
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.tab[data-view="year"]').click();
await page.waitForSelector('#view-year:not([hidden])');
ok(await text('.tally__num') === core.fmtMoney(pb.totalSgd), 'cleared tally should equal the whole path');
ok(/past the fee/.test(await text('.tally__gloss')), 'cleared state should say it is past the fee');
ok(await page.locator('.tally__gloss--done').count() === 1, 'cleared gloss should take the surplus colour');
ok(await page.locator('.bar__over').count() === 1, 'cleared bar should carry a champagne overflow');
ok(await page.locator('.bar__tick').count() === 1, 'cleared bar should mark the fee');
ok((await text('.caps')).includes(core.fmtMoney(fee)), 'cleared captions should name the fee');
ok(await page.locator('#view-year .li__idx').first().innerText() === '✓', 'a completed plan step should swap its number for a tick');
await shot('year');

// Log anything opens the full loggable list.
await page.locator('[data-act="log-anything"]').click();
await page.waitForSelector('#log-all');
ok(await page.locator('#log-all .li').count() === hydrated.entries.filter(core.canLog).length,
  'log anything should list every loggable entry');
ok(await dupeIds().then((d) => d.length === 0), 'duplicate ids on your year');

// A stepper writes through and survives a reload.
const before = await text('.tally__num');
await page.locator('#log-all .stepper button').last().click();
await page.waitForTimeout(200);
ok(await text('.tally__num') !== before, 'logging a use did not move the tally');

// ──────────────────────────────────────────────────────────────── card since
await page.evaluate(() => localStorage.setItem('pbg-card-since-v1', '2025-11-12'));
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.tab[data-view="year"]').click();
await page.waitForSelector('.since');
ok((await text('.since')).toLowerCase().includes('card since'), 'card since row missing');
ok((await text('.since__d')).includes('2025'), 'card since date not rendered');
const cyLine = await text('.since__line');
ok(/^Day \d+ of your card year\./.test(cyLine), `card year line malformed: ${cyLine}`);
const [, day, left] = cyLine.match(/Day (\d+) of your card year\. (\d+) days? left/) || [];
ok(day && left && Number(day) + Number(left) === 365, `card year should sum to 365, got ${day} + ${left}`);
await page.evaluate(() => { localStorage.removeItem('pbg-card-since-v1'); localStorage.removeItem('pbg-log-v1'); });

// ───────────────────────────────────────────────────────────── modal + theme
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.scen');
await page.locator('[data-act="method-open"]').click();
await page.waitForSelector('.modal__panel');
ok(await page.locator('.modal__type').count() === data.taxonomy.value_types.length, 'modal should define every value type');
ok(await page.locator('.modal__band').count() === data.taxonomy.grade_bands.length, 'modal should list every grade band');
ok(await page.locator('.modal__caveats li').count() === data.caveats.length, 'modal should list every caveat');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok(await page.locator('.modal__panel').count() === 0, 'Escape should close the modal');

const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
await page.locator('#themebtn').click();
await page.waitForTimeout(150);
const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
ok(themeBefore !== themeAfter, 'theme toggle did nothing');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.scen');
ok(await page.evaluate(() => document.documentElement.dataset.theme) === themeAfter, 'theme did not survive a reload');
// Both themes are first class, so the panel must stay legible in each.
const panelInk = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--panelink').trim());
ok(panelInk.length > 0, 'the ink panel lost its text colour in this theme');

// ──────────────────────────────────────────────────────────── phone viewport
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p2 = await phone.newPage();
const phoneErrors = [];
p2.on('pageerror', (e) => phoneErrors.push(String(e)));
p2.on('console', (m) => { if (m.type() === 'error') phoneErrors.push(m.text()); });
await p2.goto(base, { waitUntil: 'networkidle' });
await p2.waitForSelector('.scen');
ok(await p2.locator('.scen').count() === 4, 'phone should collapse to the first four scenarios');
const phoneLabels = await p2.locator('.scen__label').allInnerTexts();
ok(phoneLabels.join('|') === data.scenarios.slice(0, 4).map((s) => s.label).join('|'),
  `phone should show the first four in data order, got ${phoneLabels.join(', ')}`);
await p2.locator('#scen-more').click();
await p2.waitForTimeout(150);
ok(await p2.locator('.scen').count() === data.scenarios.length, 'the expander should reveal all eight');
ok(await p2.evaluate(() => getComputedStyle(document.querySelector('.nav')).position) === 'fixed',
  'the phone tab bar should be pinned to the bottom');
ok(phoneErrors.length === 0, `phone errors: ${phoneErrors.join(' | ')}`);
await phone.close();

// ───────────────────────────────────────────────────────────────────── motion
// The count-up must exist when motion is allowed, and must not when it is not.
const motion = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'no-preference' });
const p3 = await motion.newPage();
await p3.goto(base, { waitUntil: 'domcontentloaded' });
await p3.waitForSelector('.scen');
const early = await p3.locator('#hero-num').innerText();
await p3.waitForTimeout(1200);
const late = await p3.locator('#hero-num').innerText();
ok(late === core.fmtMoney(pb.totalSgd), `the numeral should settle on ${core.fmtMoney(pb.totalSgd)}, got ${late}`);
ok(early !== late || early === core.fmtMoney(pb.totalSgd), 'count-up produced no intermediate frame');
await motion.close();

// ────────────────────────────────────────────────────────────────────── done
ok(consoleErrors.length === 0, `console/page errors:\n      ${consoleErrors.join('\n      ')}`);

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n✗ page: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ page: masthead, hero, the urgent two, scenarios, the ledger, results, places, all three states of Your year, card since, modal, theme, phone and motion all render correctly');
