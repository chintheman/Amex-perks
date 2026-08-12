#!/usr/bin/env node
// One-off content update: reconcile site/benefits-data.json against the live
// Amex Singapore pages rendered on 11 Aug 2026 (see data/sources/).
//
//   node scripts/apply-2026-08-11-sources.mjs
//
// Adds 15 benefits Amex documents that the file was missing, splits three
// bundled entries into the individual benefits they contain, and corrects the
// Regional Golf programme (5 clubs -> 50+) and the Wine Credit (missing the
// S$50 bonus tier). Idempotent: re-running produces the same file.
//
// Scoring follows the model already in the data, recovered from it rather than
// invented — see SCORING below. Unscored `access` entries are used wherever a
// number would be false precision (status matches, insurance, points earn).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'site/benefits-data.json');

const SRC = {
  travel: 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card/travel/',
  access: 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card/access/',
  rewards: 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card/rewards-and-offers/',
  insurance: 'https://www.americanexpress.com/en-sg/benefits/the-platinum-card/insurance-and-protection/',
  promos: 'https://www.americanexpress.com/sg/benefits/promotions/dining/',
};

// The model this file already uses, recovered from the existing 82 scored rows:
//   value_score      = discount_pct x 2   (50% -> 100, 15% -> 30, exact on every row)
//   gross_value_sgd  = min_spend_sgd x discount_pct / 100
//   occasion_fit[k]  = (value_score + TIER_FIT[tier][k]) / 2
const TIER_FIT = {
  ultra: { date_night: 95, business: 90 },
  fine: { date_night: 100, business: 100 },
  upscale: { date_night: 85, business: 80 },
  mid: { date_night: 50, business: 35 },
  casual: { date_night: 30, business: 15 },
  cafe: { date_night: 45, business: 20 },
  buffet: { date_night: 15, business: 5 },
  buffet_premium: { date_night: 25, business: 15 },
  high_tea: { date_night: 65, business: 45 },
  bar: { date_night: 55, business: 25 },
};

function scoredDining({ id, name, section, subcategory, details, cuisine, tier, pct, minSpend, cap, accessibility, advance, pax, locations, source }) {
  const value = pct * 2;
  const fit = TIER_FIT[tier];
  return {
    id,
    name,
    category: 'dining',
    section,
    ...(subcategory ? { subcategory } : {}),
    value_type: 'discount',
    details,
    venue: { cuisine, tier, tier_group: { ultra: 'fine', fine: 'fine', upscale: 'upscale', mid: 'casual', casual: 'casual', cafe: 'casual', buffet: 'buffet', buffet_premium: 'buffet', high_tea: 'hightea', bar: 'bar' }[tier], ...(pax ? { pax } : {}) },
    economics: { min_spend_sgd: minSpend, gross_value_sgd: Math.round(minSpend * pct) / 100, discount_pct: pct },
    scores: { value, accessibility },
    occasion_fit: { date_night: (value + fit.date_night) / 2, business: (value + fit.business) / 2 },
    terms: { annual_cap: cap, advance, third_party_barred: false },
    ...(locations ? { locations } : {}),
    source,
  };
}

const entitlement = ({ id, name, category = 'lifestyle', subcategory, summary, details, terms, locations, source }) => ({
  id,
  name,
  category,
  section: category === 'lifestyle' ? 'life' : 'progs',
  subcategory,
  value_type: 'access',
  summary,
  details,
  ...(terms ? { terms } : {}),
  ...(locations ? { locations } : {}),
  source,
});

// ───────────────────────────────────────────────────────── new entitlements
const ADD = [
  // --- Hotel elite status, split out of the old KrisFlyer/Hotel bundle -----
  entitlement({
    id: 'marriott-bonvoy-gold-elite-status',
    name: 'Marriott Bonvoy Gold Elite Status',
    subcategory: 'Hotel Status',
    summary: 'Complimentary Marriott Bonvoy Gold Elite without the usual night requirement.',
    details: 'Room upgrade at check-in when available and a 25% points bonus over base-level members, across Marriott Bonvoy properties. Enrolment in Marriott Bonvoy is required first. Gold Elite amenities cannot be combined with Fine Hotels + Resorts benefits on the same stay.',
    terms: { advance: 'Enrolment required', third_party_barred: false },
    source: SRC.travel,
  }),
  entitlement({
    id: 'hilton-honors-gold-status',
    name: 'Hilton Honors Gold Status',
    subcategory: 'Hotel Status',
    summary: 'Complimentary Hilton Honors Gold at 6,600+ properties worldwide.',
    details: 'Space-available room upgrades and an 80% bonus on all base points earned. A Hilton Honors membership number is required before enrolling, and the name and email must match your American Express account exactly.',
    terms: { advance: 'Enrolment required', third_party_barred: false },
    source: SRC.travel,
  }),
  entitlement({
    id: 'radisson-rewards-premium-status',
    name: 'Radisson Rewards Premium Status',
    subcategory: 'Hotel Status',
    summary: 'Straight to Radisson Rewards Premium — early check-in, late check-out, 27 points per dollar.',
    details: 'Includes a members-only rate of up to 15% off. Enrolment in Radisson Rewards is required before the upgrade can be applied.',
    terms: { advance: 'Enrolment required', third_party_barred: false },
    source: SRC.travel,
  }),
  entitlement({
    id: 'pan-pacific-discovery-platinum-status',
    name: 'Pan Pacific DISCOVERY Platinum Status',
    subcategory: 'Hotel Status',
    summary: 'DISCOVERY Platinum without the usual 10 qualifying nights or US$5,000 spend.',
    details: 'Request through the Amex Experiences App. After validation — normally within two weeks — you receive an email invitation to complete the upgrade. Available until 31 December 2026.',
    terms: { advance: 'Request via Amex Experiences App', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.travel,
  }),

  // --- Travel, previously undocumented -------------------------------------
  entitlement({
    id: 'the-hotel-collection',
    name: 'The Hotel Collection',
    subcategory: 'Hotel Booking Program',
    summary: 'Signature perks at 1,000+ upscale hotels, on stays of two consecutive nights or more.',
    details: 'Room upgrade on arrival when available and a property credit, at over 1,000 curated upscale hotels. Booked through American Express Travel. Distinct from Fine Hotels + Resorts, which has no minimum-night requirement and a broader benefit set.',
    terms: { advance: 'Book via Amex Travel, min. 2 consecutive nights', third_party_barred: true },
    source: SRC.travel,
  }),
  entitlement({
    id: 'international-airline-program',
    name: 'International Airline Program',
    subcategory: 'Air Travel',
    summary: 'Exclusive premium-cabin savings with Singapore Airlines, Qatar, Etihad and Emirates.',
    details: 'Booked through American Express Travel Online, for solo travel or up to 8 tickets, across a variety of premium cabins. Available to both Basic and Supplementary Card Members.',
    terms: { advance: 'Book via Amex Travel Online', third_party_barred: true },
    source: SRC.travel,
  }),
  entitlement({
    id: 'hertz-gold-plus-rewards-five-star',
    name: 'Hertz Gold Plus Rewards Five Star',
    subcategory: 'Car Rental',
    summary: 'Complimentary Hertz Five Star status — discounts, upgrades and priority service.',
    details: 'Enrol in the programme and book directly with Hertz, quoting your Gold Plus Rewards Five Star membership number. Benefits do not apply to bookings made through third parties.',
    terms: { advance: 'Enrolment required, book direct', third_party_barred: true },
    source: SRC.travel,
  }),

  // --- Club status, split out of the old Shopping & Lifestyle bundle --------
  entitlement({
    id: 'comoclub-c5-tier',
    name: 'Comoclub C5 Tier',
    subcategory: 'Private Club Access',
    summary: 'C5 membership tier for 12 months, bypassing the usual spending requirement.',
    details: 'Curated experiences, limited-edition items and invitation-only events across the COMO Group and its partners. Enrol through the Amex Experiences App. Available until 31 December 2026.',
    terms: { advance: 'Enrol via Amex Experiences App', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.access,
  }),
  entitlement({
    id: 'sands-lifestyle-prestige-membership',
    name: 'Marina Bay Sands Sands LifeStyle Prestige',
    subcategory: 'Private Club Access',
    summary: 'Prestige tier without the usual S$5,000 calendar-year spend.',
    details: 'Prestige status for three months, extended by a further nine months when you spend at least S$1,500 on eligible transactions within that first three-month period. Enrolment is required. Available until 31 December 2026.',
    terms: { annual_cap: 1, advance: 'Enrolment required', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.access,
  }),
  entitlement({
    id: 'paragon-club-prestige-tier',
    name: 'Paragon Club Prestige Tier',
    subcategory: 'Private Club Access',
    summary: 'Prestige tier without the usual S$25,000 calendar-year spend.',
    details: 'Sign up as a new Paragon Club member with your unique promo code for a complimentary upgrade to Prestige, valid for six months. Available until 31 December 2026.',
    terms: { advance: 'Enrolment required, promo code', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.access,
  }),
  entitlement({
    id: 'platinum-private-spaces',
    name: 'Platinum Private Spaces',
    subcategory: 'Special Program',
    summary: 'Exclusive spaces and events through 2026, announced in the Amex Experiences App.',
    details: 'Environments crafted for comfort, connection and events, released through the year rather than as a standing entitlement. Availability is announced in the Amex Experiences App, so it needs checking rather than booking.',
    terms: { advance: 'Watch the Amex Experiences App', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.access,
  }),

  // --- Membership Rewards, split out of the old bundle ----------------------
  entitlement({
    id: 'membership-rewards-base-earn',
    name: 'Membership Rewards — Base Earn',
    subcategory: 'Rewards Program',
    summary: '2 Membership Rewards points for every S$1.60 spent, and the points never expire.',
    details: 'The standing earn rate on all eligible spend. Exclusions apply. Points do not expire while the account is open, which is what makes the bonus programmes below worth enrolling in rather than banking on.',
    source: SRC.rewards,
  }),
  entitlement({
    id: '10xcelerator-bonus-points',
    name: '10Xcelerator Bonus Points',
    subcategory: 'Rewards Program',
    summary: '10 Membership Rewards points per S$1.60 at partner merchants — annual enrolment required.',
    details: 'Up to 10 bonus points per S$1.60 on the first S$16,000 of cumulative spend at participating Platinum 10Xcelerator partners in Singapore, when you enrol at go.amex/bonusmrenrolment-plat between 1 January and 31 December 2026. Spend beyond S$16,000 continues to earn a total of 10 points per S$1.60. Enrolment must be repeated each year.',
    terms: { advance: 'Annual enrolment required', third_party_barred: false, expires: '2026-12-31' },
    source: SRC.rewards,
  }),
  entitlement({
    id: 'foreign-currency-bonus-points',
    name: 'Foreign Currency Bonus Points',
    subcategory: 'Rewards Program',
    summary: 'Up to 7 points per S$1.60 on your first S$15,000 of foreign-currency spend.',
    details: 'Equivalent to about 2.19 miles per S$1 spent, on any currency other than Singapore dollars, from 23 February 2026 to 22 February 2027. Enrolment is required at go.amex/bonusmrfx-plat — unenrolled spend earns the base rate only.',
    terms: { advance: 'Enrolment required', third_party_barred: false, expires: '2027-02-22' },
    source: SRC.rewards,
  }),
  entitlement({
    id: 'singapore-airlines-scoot-bonus-points',
    name: 'Singapore Airlines / Scoot Bonus Points',
    subcategory: 'Rewards Program',
    summary: '5 Membership Rewards points per S$1.60 booked directly with SIA or Scoot.',
    details: 'Applies to purchases made directly with Singapore Airlines and Scoot. Excludes KrisShop, onboard purchases and KrisShop.com. Stacks with the Airline Credit, which covers the same booking channel.',
    source: SRC.rewards,
  }),
  entitlement({
    id: 'member-invites',
    name: 'Member Invites',
    subcategory: 'Rewards Program',
    summary: 'Three invites that unlock the highest available offer for friends, and earn you points.',
    details: 'Each invite gives the recipient the best offer currently available on their card of choice, and pays you referral points when they are approved. Three per year.',
    terms: { annual_cap: 3, third_party_barred: false },
    source: SRC.rewards,
  }),

  // --- Insurance, split into what Amex actually names -----------------------
  entitlement({
    id: 'purchase-protection',
    name: 'Purchase Protection',
    subcategory: 'Insurance & Protection',
    summary: 'Up to S$10,000 to replace or repair items stolen or damaged within 90 days of purchase.',
    details: 'Applies to items bought on the Platinum Card. Cover runs for 90 days from the date of purchase.',
    source: SRC.insurance,
  }),
  entitlement({
    id: 'return-guarantee',
    name: 'Return Guarantee',
    subcategory: 'Insurance & Protection',
    summary: 'Up to S$1,000 per item when a retailer will not take an eligible purchase back.',
    details: 'Applies to eligible items bought on the Platinum Card from a retailer in your country of residence, within 90 days of purchase.',
    source: SRC.insurance,
  }),
  entitlement({
    id: 'extended-warranty-protection',
    name: 'Extended Warranty Protection',
    subcategory: 'Insurance & Protection',
    summary: 'Up to S$10,000 on appliances that fail during the extended warranty period.',
    details: 'Covers appliances bought on the Platinum Card that stop working because of unforeseen electrical or mechanical problems, once the manufacturer warranty has run out.',
    source: SRC.insurance,
  }),
  entitlement({
    id: 'fraud-protection-guarantee',
    name: 'Fraud Protection Guarantee',
    subcategory: 'Insurance & Protection',
    summary: 'Account monitoring, online protection and fraud alerts, with no liability for fraudulent charges.',
    details: 'Always on, nothing to enrol in. Covers account monitoring, online safety protection and fraud alerts across all spend on the card.',
    source: SRC.insurance,
  }),

  // --- Dining promotions the promos page lists and the file did not ---------
  scoredDining({
    id: 'pan-pacific-hotels-group',
    name: 'Pan Pacific Hotels Group',
    section: 'promo',
    details: '15% savings on dining across participating Pan Pacific and PARKROYAL restaurants in Singapore.',
    cuisine: 'Multi-outlet',
    tier: 'upscale',
    pct: 15,
    minSpend: 180,
    cap: 6,
    accessibility: 70,
    advance: 'Varies by outlet',
    pax: 2,
    locations: [{ name: 'Pan Pacific Singapore', lat: 1.2929, lng: 103.8583, address: '7 Raffles Blvd, Marina Square, S039595' }],
    source: SRC.promos,
  }),
];

// Sheraton's wedding offer is a discount, but on a once-in-a-lifetime purchase.
// It is scored with the same rules as everything else — 5% off gives a low value
// score, and a single, heavily-planned redemption gives a low accessibility
// score — so it lands near the bottom rather than topping the list on raw dollars.
ADD.push({
  id: 'sheraton-towers-singapore-weddings',
  name: 'Sheraton Towers Singapore — Weddings',
  category: 'lifestyle',
  section: 'life',
  subcategory: 'Weddings',
  value_type: 'discount',
  details: 'True Love Weddings: 5% off new wedding packages at Sheraton Towers Singapore. The minimum spend below is an estimate for a typical banquet of around 20 tables — Amex and the hotel do not publish package prices.',
  economics: { min_spend_sgd: 30000, gross_value_sgd: 1500, discount_pct: 5 },
  scores: { value: 10, accessibility: 20 },
  terms: { annual_cap: 1, advance: 'Advance booking, new packages only', third_party_barred: false },
  locations: [{ name: 'Sheraton Towers Singapore', lat: 1.3117, lng: 103.8399, address: '39 Scotts Rd, S228230' }],
  source: SRC.promos,
});

// ───────────────────────────────────────────── edits to existing entries
const EDIT = {
  // 5 clubs -> "over 50 local and regional golf clubs" per the Access page.
  'regional-golf-programme': (e) => ({
    ...e,
    summary: 'Complimentary green fees at over 50 local and regional golf clubs when you bring a paying companion.',
    details: 'Complimentary green fees (treated as ~50% value versus a paying pair) at over 50 local and regional golf clubs, including Sentosa Golf Club, Orchid Country Club, Sembawang Country Club and Warren Golf & Country Club in Singapore — you must be accompanied by at least one paying companion. Weekday standard, weekend at select clubs. Bookings go through The Platinum Concierge on 1800 392 1177. Valid through 31 December 2026. The map shows the Singapore clubs only; the programme is regional.',
    terms: { ...e.terms, advance: 'Book via The Platinum Concierge' },
    source: SRC.access,
  }),
  // The S$50 bonus tier at S$600 was missing entirely.
  'platinum-wine-credit': (e) => ({
    ...e,
    details: 'S$400 per calendar year, as two S$200 credits — one from January to June and another from July to December — each requiring a minimum S$300 single transaction on the Platinum Wine Website, powered by Vivino. A further S$50 comes off your bill when you spend S$600 or more.',
    source: SRC.access,
  }),
  // Now that The Hotel Collection is its own entry, this one is FHR only.
  'fine-hotels-resorts-the-hotel-collection': (e) => ({
    ...e,
    id: 'fine-hotels-resorts',
    name: 'Fine Hotels + Resorts',
    subcategory: 'Hotel Booking Program',
    summary: 'Benefits averaging S$800 per stay at 1,600+ properties, with no minimum-night requirement.',
    details: 'Every stay includes 12 PM check-in when available, a room upgrade when available, daily breakfast for two, a US$100 property credit, complimentary Wi-Fi and a guaranteed 4 PM late check-out. Booked through American Express Travel. Some room categories are not eligible for upgrade and the credit varies by property.',
    source: SRC.travel,
  }),
};

// Bundles that are replaced by the individual entries added above.
const REMOVE = new Set([
  'krisflyer-hotel-elite-status-and-membership-rewards',
  'shopping-and-lifestyle-club-status',
  'purchase-protection-refund-protection-and-extended-warra',
]);

// ─────────────────────────────────────────────────────────────────── apply
const ORDER = ['id', 'name', 'category', 'section', 'subcategory', 'value_type', 'summary',
  'details', 'venue', 'economics', 'scores', 'occasion_fit', 'terms', 'locations', 'source'];
const order = (e) => Object.fromEntries(ORDER.filter((k) => k in e && e[k] != null).map((k) => [k, e[k]]));

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const before = data.entries.length;

let entries = data.entries.filter((e) => !REMOVE.has(e.id));
entries = entries.map((e) => (EDIT[e.id] ? EDIT[e.id](e) : e));

const have = new Set(entries.map((e) => e.id));
const added = ADD.filter((e) => !have.has(e.id));
entries = [...entries, ...added].map(order).sort((a, b) => a.id.localeCompare(b.id));

data.generated_at = '2026-08-11';
data.next_refresh = '2026-08-25';
data.entries = entries;

writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`✓ ${before} → ${entries.length} entries`);
console.log(`  +${added.length} added   −${REMOVE.size} bundles removed   ~${Object.keys(EDIT).length} corrected`);
