#!/usr/bin/env node
// Render every Amex Singapore source page to data/sources/*.txt.
//
//   npm run sources          fetch all pages
//   npm run sources -- dining access
//
// Why a browser: americanexpress.com serves navigation chrome to plain HTTP
// clients and renders the actual benefit copy on the client, so curl/fetch
// returns nothing useful. Akamai also blocks direct navigation to some pages,
// which is why `travel` is reached by clicking through from the hub.
//
// The output is committed. That is the point: on each 14-day refresh, run this
// and `git diff data/sources/` shows exactly what Amex changed since last time,
// so the reconciliation is a diff rather than a re-read.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/sources');

const BENEFITS = 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card';
const PAGES = {
  hub: { url: `${BENEFITS}/` },
  // Direct navigation to /travel/ returns an Akamai "Access Denied"; arriving
  // from the hub in the same session works.
  travel: { url: `${BENEFITS}/travel/`, via: `${BENEFITS}/`, link: 'a[href*="/the-platinum-card/travel"]' },
  dining: { url: `${BENEFITS}/dining/` },
  access: { url: `${BENEFITS}/access/` },
  insurance: { url: `${BENEFITS}/insurance-and-protection/` },
  rewards: { url: `${BENEFITS}/rewards-and-offers/` },
  campaign: { url: 'https://www.americanexpress.com/en-sg/campaigns/the-platinum-card/' },
  chargecard: { url: 'https://www.americanexpress.com/sg/charge-cards/platinum-card/' },
  love_restaurants: { url: 'https://www.americanexpress.com/sg/benefits/love-dining/love-restaurants.html' },
  love_dining_hotels: { url: 'https://www.americanexpress.com/sg/benefits/love-dining/love-dining-hotels.html' },
  promotions: { url: 'https://www.americanexpress.com/sg/benefits/promotions/dining/' },
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const wanted = process.argv.slice(2);
const todo = Object.entries(PAGES).filter(([name]) => !wanted.length || wanted.includes(name));

// Lazy content needs scrolling; collapsed accordions hide most of the terms.
async function reveal(page) {
  for (let i = 0; i < 25; i += 1) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(300); }
  for (const sel of ['button[aria-expanded="false"]', '[role="button"][aria-expanded="false"]', 'summary']) {
    for (const el of (await page.$$(sel)).slice(0, 80)) {
      try { await el.click({ timeout: 700 }); await page.waitForTimeout(110); } catch { /* not clickable */ }
    }
  }
  await page.waitForTimeout(1500);
  for (let i = 0; i < 25; i += 1) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(250); }
}

mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 }, locale: 'en-SG', userAgent: UA });
let failed = 0;

for (const [name, { url, via, link }] of todo) {
  const page = await ctx.newPage();
  try {
    await page.goto(via || url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    if (link) {
      await page.locator(link).first().click({ timeout: 15000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(5000);
    }
    await reveal(page);
    const text = await page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\n{3,}/g, '\n\n'));
    if (/Access Denied|You don't have permission/.test(text)) throw new Error('blocked by Akamai');
    if (text.length < 1000) throw new Error(`only ${text.length} chars — page probably did not render`);
    writeFileSync(join(OUT, `${name}.txt`), `SOURCE: ${page.url()}\nFETCHED: ${stamp}\n\n${text}`);
    console.log(`  ${String(text.length).padStart(6)}  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAILED  ${name}: ${err.message.split('\n')[0]}`);
  }
  await page.close();
}

await browser.close();
console.log(failed ? `\n✕ ${failed} of ${todo.length} page(s) failed` : `\n✓ ${todo.length} source page(s) written to data/sources/`);
process.exit(failed ? 1 : 0);
