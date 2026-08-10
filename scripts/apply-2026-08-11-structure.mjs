#!/usr/bin/env node
// Structural update for the scenario-first redesign.
//
//   node scripts/apply-2026-08-11-structure.mjs
//
// Adds four fields the new UI is built on, and the four parent benefits that
// the venue rows hang off:
//
//   kind      benefit | venue   — 76 of the rows are restaurants, not benefits
//   parent    the benefit a venue spends (love-dining-restaurants, …)
//   effort    claim | book | have — what you have to DO about it
//   scenarios top-level block — the front door, one saved filter each
//
// Idempotent: re-running produces the same file.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, EFFORTS } from './taxonomy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'site/benefits-data.json');

const AMEX = {
  loveRestaurants: 'https://www.americanexpress.com/sg/benefits/love-dining/love-restaurants.html',
  loveHotels: 'https://www.americanexpress.com/sg/benefits/love-dining/love-dining-hotels.html',
  promos: 'https://www.americanexpress.com/sg/benefits/promotions/dining/',
  access: 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card/access/',
};

// ───────────────────────────────────────────────────── the parent benefits
// These did not exist: the file had 26 Love Dining restaurants but nothing
// saying what Love Dining IS. Their headline figures are derived from their
// children at render time, so nothing here double-counts.
const PARENTS = [
  {
    id: 'love-dining-restaurants',
    name: 'Love Dining · Restaurants',
    category: 'dining', section: 'ldr', value_type: 'access',
    summary: 'Up to 50% off the food bill for two, year-round, at standalone restaurants.',
    details: 'Unlimited use across participating standalone restaurants. The discount is calculated on the food bill and scales with the number of diners — half the food bill applies to two people dining. Blackout dates apply at some venues and most exclude bookings made through third-party platforms.',
    terms: { advance: 'Varies 0–2 days by outlet', third_party_barred: true },
    source: AMEX.loveRestaurants,
  },
  {
    id: 'love-dining-hotels',
    name: 'Love Dining · Hotels',
    category: 'dining', section: 'ldh', value_type: 'access',
    summary: 'Up to 50% off food at restaurants and bars inside participating hotels.',
    details: 'The same Love Dining programme applied to hotel outlets — buffets, fine dining, high tea and hotel bars. Discounts vary by property and outlet, typically 15–50%, and most require booking one to two days ahead.',
    terms: { advance: 'Varies 1–2 days / 48h by outlet', third_party_barred: true },
    source: AMEX.loveHotels,
  },
  {
    id: 'dining-promotions',
    name: 'Dining Promotions',
    category: 'dining', section: 'promo', value_type: 'access',
    summary: 'A rotating set of limited-time restaurant offers, separate from Love Dining.',
    details: 'Time-limited offers negotiated with individual restaurants and hotel groups. The list changes — check validity dates before relying on one. These stack with nothing else and are not part of the Love Dining programme.',
    terms: { advance: 'Varies by outlet', third_party_barred: false },
    source: AMEX.promos,
  },
  {
    id: 'platinum-spa-benefit',
    name: 'Platinum Spa Benefit',
    category: 'lifestyle', section: 'life', subcategory: 'Spa & Wellness', value_type: 'access',
    summary: 'Up to 30% off à la carte spa services at a set of Singapore spas.',
    details: 'Amex advertises up to 30% off à la carte services. The individual spas listed under this benefit currently run from 15% to 25%, so the headline rate may apply to a venue not yet captured here — worth confirming with The Platinum Concierge.',
    terms: { advance: 'Booking required', third_party_barred: false },
    source: AMEX.access,
  },
];

// A venue's parent, by section. Spas are the exception — they sit in `life`
// alongside genuine benefits, so they are matched by id.
const PARENT_BY_SECTION = { ldr: 'love-dining-restaurants', ldh: 'love-dining-hotels', promo: 'dining-promotions' };
const SPA_VENUES = new Set(['adeva-spa', 'spa-rael', 'the-ultimate-spa']);

// ───────────────────────────────────────────────────────────────── effort
// Assigned per entry rather than pattern-matched: "enrolment required" and
// "book via the app" read similarly but mean opposite things to a user.
const CLAIM = new Set([
  '10xcelerator-bonus-points', 'airline-credit', 'comoclub-c5-tier',
  'foreign-currency-bonus-points', 'global-dining-credit', 'hertz-gold-plus-rewards-five-star',
  'hilton-honors-gold-status', 'marriott-bonvoy-gold-elite-status',
  'pan-pacific-discovery-platinum-status', 'paragon-club-prestige-tier',
  'platinum-private-spaces', 'platinum-wine-credit', 'radisson-rewards-premium-status',
  'sands-lifestyle-prestige-membership',
  // The travel page is explicit: "Priority Pass enrolment is required. To enrol,
  // please call us at 1800 392 1177." Lounge access is not automatic.
  'global-lounge-collection',
]);
const HAVE = new Set([
  'travel-insurance', 'purchase-protection', 'return-guarantee',
  'extended-warranty-protection', 'fraud-protection-guarantee',
  'the-platinum-concierge-and-global-assist', 'membership-rewards-base-earn',
  'singapore-airlines-scoot-bonus-points', 'member-invites', 'bicester-collection-shopping',
]);

const effortFor = (e) => (CLAIM.has(e.id) ? 'claim' : HAVE.has(e.id) ? 'have' : 'book');

// ──────────────────────────────────────────────────────────────── scenarios
// Each is a saved filter plus a sentence. Adding one is a data edit, not code.
// The validator enforces that every scenario still matches something.
const SCENARIOS = [
  {
    key: 'date-night',
    label: 'Date night',
    blurb: 'Somewhere worth the evening, without paying full price.',
    filter: { kind: 'venue', occasion: 'date_night', min_occasion_fit: 80 },
    sort: 'occasion_desc',
  },
  {
    key: 'impress',
    label: 'Impress a client',
    blurb: 'Polished and quiet enough to talk. Not bargain-hunting.',
    filter: { kind: 'venue', occasion: 'business', min_occasion_fit: 80, tier_groups: ['fine', 'upscale'] },
    sort: 'occasion_desc',
  },
  {
    key: 'free',
    label: 'Actually free',
    blurb: 'No minimum spend. Nothing to unlock first.',
    filter: { max_min_spend: 0 },
    sort: 'value_desc',
  },
  {
    key: 'enrol',
    label: 'Enrol and forget',
    blurb: 'Worth ten minutes once. Most people never claim these.',
    filter: { effort: 'claim' },
    sort: 'name_asc',
  },
  {
    key: 'ending-soon',
    label: 'Ending soon',
    blurb: 'Has an expiry date attached. Use it or lose it.',
    filter: { has_expiry: true },
    sort: 'expiry_asc',
  },
  {
    key: 'crowd',
    label: 'Feeding a crowd',
    blurb: 'Buffets and high tea — where a group discount actually lands.',
    filter: { kind: 'venue', tier_groups: ['buffet', 'hightea'] },
    sort: 'value_desc',
  },
  {
    key: 'travelling',
    label: 'Flying somewhere',
    blurb: 'Everything that only matters once you have a trip booked.',
    filter: { subcategories: ['Airport Lounge Access', 'Air Travel', 'Hotel Status', 'Hotel Booking Program', 'Hotel Stay', 'Insurance & Protection', 'Car Rental'] },
    sort: 'name_asc',
  },
  {
    key: 'worth-it',
    label: 'Is the fee worth it?',
    blurb: 'The shortest path to clearing S$1,744.',
    view: 'payback',
  },
];

// ─────────────────────────────────────────────────────────────────── apply
const ORDER = ['id', 'name', 'kind', 'parent', 'category', 'section', 'subcategory', 'value_type',
  'effort', 'summary', 'details', 'venue', 'economics', 'scores', 'occasion_fit', 'terms',
  'locations', 'source'];
const order = (e) => Object.fromEntries(ORDER.filter((k) => k in e && e[k] != null).map((k) => [k, e[k]]));

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const parentIds = new Set(PARENTS.map((p) => p.id));
const have = new Set(data.entries.map((e) => e.id));

let entries = [...data.entries, ...PARENTS.filter((p) => !have.has(p.id))];

entries = entries.map((e) => {
  const parent = parentIds.has(e.id) ? null
    : SPA_VENUES.has(e.id) ? 'platinum-spa-benefit'
      : PARENT_BY_SECTION[e.section] || null;
  return order({ ...e, kind: parent ? 'venue' : 'benefit', parent, effort: effortFor(e) });
});

entries.sort((a, b) => a.id.localeCompare(b.id));

// Taxonomy blocks the page reads instead of hard-coding.
data.taxonomy = { ...data.taxonomy, kinds: KINDS, efforts: EFFORTS };
data.scenarios = SCENARIOS;
data.entries = entries;

writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);

const count = (f) => entries.filter(f).length;
console.log(`✓ ${entries.length} entries (+${PARENTS.length} parent benefits)`);
console.log(`  ${count((e) => e.kind === 'benefit')} benefits · ${count((e) => e.kind === 'venue')} venues`);
console.log(`  claim ${count((e) => e.effort === 'claim')} · book ${count((e) => e.effort === 'book')} · have ${count((e) => e.effort === 'have')}`);
console.log(`  ${SCENARIOS.length} scenarios`);
