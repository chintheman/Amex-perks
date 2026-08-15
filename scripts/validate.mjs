#!/usr/bin/env node
// Pre-publish gate for benefits-data.json. Run this before every refresh ships.
//
//   node scripts/validate.mjs [site/benefits-data.json]
//
// Exit code 1 = errors (do not publish). Warnings are printed but do not fail,
// because they flag judgement calls (an expired promo, a payback path that no
// longer clears the fee) rather than broken data.
//
// This checks more than the JSON Schema can: cross-references, derivation
// agreement, sort order, and the "absent, never null" rule. The schema file is
// still worth running in CI for editor support — see README.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_KEYS, VALUE_TYPE_KEYS, SECTION_KEYS, TIER_GROUP_KEYS, TIER_KEYS,
  OCCASION_KEYS, GRADE_KEYS, SECTIONS, TIERS, KIND_KEYS, EFFORT_KEYS, KINDS, EFFORTS,
} from './taxonomy.mjs';
import { compositeScore, gradeFor, summaryOf, SUMMARY_MAX, hydrate, runScenario } from '../site/guide-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, process.argv[2] || 'site/benefits-data.json');

const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const check = (cond, where, msg) => { if (!cond) fail(where, msg); };

const ENTRY_KEY_ORDER = [
  'id', 'name', 'kind', 'parent', 'category', 'section', 'subcategory', 'value_type',
  'effort', 'summary', 'details', 'value_phrase', 'venue', 'economics', 'scores',
  'occasion_fit', 'terms', 'locations', 'source',
];
// The value column shows one thing per row. A phrase is what an unpriced row
// shows instead of a figure, so a row carrying both would be authoring a
// conflict the page then has to arbitrate silently.
const PHRASE_MAX = 28;
// Nothing outside these lists may appear — a stray key is almost always a
// typo that the page would silently ignore.
const BLOCK_KEYS = {
  venue: ['group', 'cuisine', 'tier', 'tier_group', 'pax', 'fixed_set', 'set_price_sgd'],
  economics: ['min_spend_sgd', 'gross_value_sgd', 'discount_pct', 'min_spend_to_activate', 'credit_value_sgd'],
  scores: ['value', 'accessibility'],
  terms: ['annual_cap', 'advance', 'condition', 'third_party_barred', 'expires'],
  occasion_fit: OCCASION_KEYS,
};
const LOCATION_KEYS = ['name', 'lat', 'lng', 'address'];
// House style: no em or en dashes in anything written for this guide.
// An en dash between digits is a numeric range ("1–2 days"), which is correct
// typography and not the joining-dash that reads as machine-written. Everything
// else is rejected.
const DASH = /(?<![0-9])[\u2013\u2014]|[\u2013\u2014](?![0-9])/;
// `details` used to be exempt, on the grounds that it quotes Amex. Most of it
// does not: it is our prose about Amex's terms, and the editorial redesign
// promotes it to the row subtitle, so fifteen em dashes were sitting in the
// most-read copy on the page. It is checked now, with day ranges ("Mon\u2013Sat")
// allowed alongside numeric ones, both being typography rather than the tell
// this rule is aimed at.
const DAY_END = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/;
const proseDash = (s) => {
  if (typeof s !== 'string') return false;
  for (const m of s.matchAll(/[\u2013\u2014]/g)) {
    const before = s.slice(Math.max(0, m.index - 3), m.index);
    const after = s.slice(m.index + 1, m.index + 4);
    if (/[0-9]\s?$/.test(before) && /^\s?[0-9]/.test(after)) continue;
    if (DAY_END.test(before)) continue;
    return true;
  }
  return false;
};
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const hasWords = (s) => typeof s === 'string' && /[a-z0-9]/i.test(s);
const inRange = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const addDays = (iso, d) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

// "Absent, never null" — walk everything once rather than trusting each check.
function assertNoNulls(node, path) {
  if (node === null) { fail(path, 'null is not a legal value, omit the key instead'); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => assertNoNulls(v, `${path}[${i}]`)); return; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) assertNoNulls(v, `${path}.${k}`);
    return;
  }
  if (typeof node === 'string' && node.trim() !== '' && !hasWords(node)) {
    fail(path, `placeholder string ${JSON.stringify(node)}, omit the key instead`);
  }
}

// ─────────────────────────────────────────────────────────────── top level
const raw = readFileSync(FILE, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`✕ ${FILE}: not valid JSON — ${err.message}`);
  process.exit(1);
}

assertNoNulls(data, 'root');
check(data.schema_version === 2, 'root', `schema_version must be 2, got ${data.schema_version}`);
check(isDate(data.generated_at), 'root', 'generated_at must be YYYY-MM-DD');
// The cycle is a ceiling, not an equation. Pinning next_refresh to exactly
// generated_at + refresh_days meant an off-cycle pass, refreshing early because
// the page is being worked on, silently pushed the next scheduled one back by
// however many days it ran early. The invariant that matters is that the file
// is never left claiming a date it cannot meet: after today, and no further out
// than a full cycle.
if (isDate(data.generated_at) && data.next_refresh) {
  const latest = addDays(data.generated_at, data.refresh_days ?? 14);
  check(isDate(data.next_refresh), 'root', 'next_refresh must be YYYY-MM-DD');
  check(data.next_refresh > data.generated_at, 'root',
    `next_refresh ${data.next_refresh} is not after generated_at ${data.generated_at}`);
  check(data.next_refresh <= latest, 'root',
    `next_refresh ${data.next_refresh} is more than ${data.refresh_days ?? 14} days out, the cycle would lapse (latest ${latest})`);
}
check(typeof data.card?.annual_fee_sgd === 'number' && data.card.annual_fee_sgd > 0, 'card', 'annual_fee_sgd must be a positive number');
check(hasWords(data.card?.name), 'card', 'name is required');

const w = data.scoring?.weights;
check(w && typeof w.value === 'number' && typeof w.accessibility === 'number', 'scoring', 'weights.value and weights.accessibility are required');
if (w) check(Math.abs(w.value + w.accessibility - 1) < 1e-9, 'scoring', `weights must sum to 1, got ${w.value + w.accessibility}`);

// ─────────────────────────────────────────────────────────────── taxonomy
const tax = data.taxonomy || {};
const keysOf = (list) => (Array.isArray(list) ? list.map((x) => x.key) : []);
const sameSet = (a, b) => a.length === b.length && a.every((k) => b.includes(k));

check(sameSet(keysOf(tax.categories), CATEGORY_KEYS), 'taxonomy.categories', `expected ${CATEGORY_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.value_types), VALUE_TYPE_KEYS), 'taxonomy.value_types', `expected ${VALUE_TYPE_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.sections), SECTION_KEYS), 'taxonomy.sections', `expected ${SECTION_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.tier_groups), TIER_GROUP_KEYS), 'taxonomy.tier_groups', `expected ${TIER_GROUP_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.occasions), OCCASION_KEYS), 'taxonomy.occasions', `expected ${OCCASION_KEYS.join(', ')}`);
check(sameSet(Object.keys(tax.tiers || {}), TIER_KEYS), 'taxonomy.tiers', `expected ${TIER_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.kinds), KIND_KEYS), 'taxonomy.kinds', `expected ${KIND_KEYS.join(', ')}`);
check(sameSet(keysOf(tax.efforts), EFFORT_KEYS), 'taxonomy.efforts', `expected ${EFFORT_KEYS.join(', ')}`);
for (const list of [[tax.kinds, KINDS, 'kinds'], [tax.efforts, EFFORTS, 'efforts']]) {
  const [inFile, canonical, name] = list;
  for (const item of inFile || []) {
    const want = canonical.find((c) => c.key === item.key);
    check(want && item.label === want.label && item.desc === want.desc,
      `taxonomy.${name}.${item.key}`, 'label or desc disagrees with scripts/taxonomy.mjs');
  }
}

for (const [tier, def] of Object.entries(tax.tiers || {})) {
  check(TIER_GROUP_KEYS.includes(def.group), `taxonomy.tiers.${tier}`, `group "${def.group}" is not a tier group`);
  check(def.group === TIERS[tier]?.group, `taxonomy.tiers.${tier}`, 'group disagrees with scripts/taxonomy.mjs');
}
for (const t of tax.value_types || []) {
  check(hasWords(t.definition), `taxonomy.value_types.${t.key}`, 'definition is shown in the methodology modal and is required');
  check(!DASH.test(t.definition || ''), `taxonomy.value_types.${t.key}`, 'definition contains a dash');
}
// Everything else the methodology modal prints, which the first version of this
// rule missed even though the commit claimed to enforce it there.
(data.caveats || []).forEach((c, i) => check(!DASH.test(c), `caveats[${i}]`, 'contains a dash'));
for (const k of ['formula', 'occasion_note']) {
  if (data.scoring?.[k]) check(!DASH.test(data.scoring[k]), `scoring.${k}`, 'contains a dash');
}

const bands = tax.grade_bands || [];
check(bands.length > 0, 'taxonomy.grade_bands', 'at least one band is required');
bands.forEach((b, i) => {
  check(GRADE_KEYS.includes(b.grade), `taxonomy.grade_bands[${i}]`, `unknown grade "${b.grade}"`);
  check(inRange(b.min, 0, 100), `taxonomy.grade_bands[${i}]`, 'min must be 0–100');
  if (i > 0) check(b.min < bands[i - 1].min, `taxonomy.grade_bands[${i}]`, 'bands must be ordered high → low');
});
if (bands.length) check(bands[bands.length - 1].min === 0, 'taxonomy.grade_bands', 'the last band must reach 0 so every score gets a grade');
check(Array.isArray(data.caveats) && data.caveats.length > 0, 'caveats', 'the methodology modal needs at least one caveat');

for (const grp of ['categories', 'value_types', 'sections', 'tier_groups', 'occasions', 'kinds', 'efforts']) {
  for (const item of tax[grp] || []) {
    for (const k of ['label', 'desc', 'chip']) {
      if (item[k] && DASH.test(item[k])) fail(`taxonomy.${grp}.${item.key}.${k}`, 'contains a dash');
    }
  }
}

const sectionByKey = Object.fromEntries((tax.sections || []).map((s) => [s.key, s]));

// ──────────────────────────────────────────────────────────────── entries
const entries = Array.isArray(data.entries) ? data.entries : [];
check(entries.length > 0, 'entries', 'no entries');

const seenIds = new Set();
const seenNames = new Map();
let outOfOrder = 0;

entries.forEach((e, i) => {
  const at = `entries[${i}] ${e.id || '(no id)'}`;

  // identity + ordering
  check(/^[a-z0-9][a-z0-9-]*$/.test(e.id || ''), at, `id "${e.id}" must be a lowercase slug`);
  check(!seenIds.has(e.id), at, `duplicate id "${e.id}"`);
  seenIds.add(e.id);
  if (i > 0 && String(e.id).localeCompare(entries[i - 1].id) < 0) outOfOrder += 1;
  if (seenNames.has(e.name)) warn(at, `name duplicates ${seenNames.get(e.name)} — check it is not a double entry`);
  else seenNames.set(e.name, e.id);

  const order = ENTRY_KEY_ORDER.filter((k) => k in e);
  check(JSON.stringify(Object.keys(e)) === JSON.stringify(order), at,
    `keys out of canonical order (expected ${order.join(', ')})`);
  for (const k of Object.keys(e)) check(ENTRY_KEY_ORDER.includes(k), at, `unknown field "${k}"`);
  for (const [block, allowed] of Object.entries(BLOCK_KEYS)) {
    for (const k of Object.keys(e[block] || {})) check(allowed.includes(k), at, `unknown field "${block}.${k}"`);
  }
  (e.locations || []).forEach((loc, j) => {
    for (const k of Object.keys(loc)) check(LOCATION_KEYS.includes(k), at, `unknown field "locations[${j}].${k}"`);
  });

  // structure: what this row is, and what you have to do about it
  check(KIND_KEYS.includes(e.kind), at, `unknown kind "${e.kind}"`);
  check(EFFORT_KEYS.includes(e.effort), at, `unknown effort "${e.effort}"`);
  if (e.kind === 'venue') check(e.parent != null, at, 'a venue must name the benefit it spends');
  if (e.kind === 'benefit') check(e.parent == null, at, 'a benefit cannot have a parent');

  // taxonomy membership
  check(CATEGORY_KEYS.includes(e.category), at, `unknown category "${e.category}"`);
  check(VALUE_TYPE_KEYS.includes(e.value_type), at, `unknown value_type "${e.value_type}"`);
  check(SECTION_KEYS.includes(e.section), at, `unknown section "${e.section}"`);
  if (e.category === 'lifestyle') check(e.section === 'life', at, 'lifestyle entries belong in section "life"');
  else check(e.section !== 'life', at, 'section "life" is for lifestyle entries only');
  if (e.subcategory != null) {
    check(e.subcategory !== sectionByKey[e.section]?.default_subcategory, at,
      'subcategory repeats the section default — omit it');
  }

  // prose
  check(hasWords(e.name), at, 'name is required');
  check(!DASH.test(e.name), at, `name contains a dash: ${e.name}`);
  if (e.summary != null) check(!DASH.test(e.summary), at, 'summary contains a dash');
  if (e.details != null) {
    check(!proseDash(e.details), at,
      'details contains a dash in prose — a number or day range may keep one, joined clauses may not');
  }
  if (e.summary != null) {
    check(e.summary.length <= 240, at, `summary is ${e.summary.length} chars — that is a paragraph, move it to details`);
    if (e.summary.length > SUMMARY_MAX + 50) warn(at, `summary is ${e.summary.length} chars — collapsed rows will truncate it`);
    check(e.summary !== summaryOf(e.details, null), at, 'summary repeats the first sentence of details — omit it');
  }
  if (e.value_type === 'access') {
    check(hasWords(e.summary) && hasWords(e.details), at, 'access entries need both summary and details');
    check(hasWords(e.value_phrase), at,
      'access entries need a value_phrase — the value column must never render blank for them');
  }
  if (e.value_phrase != null) {
    check(!DASH.test(e.value_phrase), at, 'value_phrase contains a dash');
    check(e.value_phrase.length <= PHRASE_MAX, at,
      `value_phrase is ${e.value_phrase.length} chars — over ${PHRASE_MAX} it wraps the value column`);
    // A row with both an authored phrase and a derivable figure would render
    // one and silently drop the other. Whichever the page picked, the file
    // would be asserting something it does not show.
    const money = (e.economics?.gross_value_sgd ?? null) != null && (e.terms?.annual_cap ?? null) != null;
    check(!money, at, 'value_phrase on a row that already has a money figure — drop one of them');
  }

  // venue
  const v = e.venue || {};
  if (v.tier != null) {
    check(TIER_KEYS.includes(v.tier), at, `unknown tier "${v.tier}"`);
    check(v.tier_group === tax.tiers?.[v.tier]?.group, at,
      `tier_group "${v.tier_group}" does not match taxonomy.tiers.${v.tier}.group`);
  }
  if (v.tier_group != null) {
    check(TIER_GROUP_KEYS.includes(v.tier_group), at, `unknown tier_group "${v.tier_group}"`);
    check(v.tier != null, at, 'tier_group without tier');
  }
  if (v.set_price_sgd != null) check(v.fixed_set === true, at, 'set_price_sgd requires fixed_set: true');
  if (v.pax != null) check(Number.isInteger(v.pax) && v.pax >= 1, at, 'pax must be a positive integer');

  // economics + scores
  const m = e.economics;
  const s = e.scores;
  if (e.value_type === 'access') {
    check(!m && !s, at, 'access entries carry no economics or scores');
  } else {
    check(!!m, at, 'economics is required on scored entries');
    check(!!s, at, 'scores is required on scored entries');
  }
  if (m) {
    check(inRange(m.min_spend_sgd, 0, Infinity), at, 'economics.min_spend_sgd must be a number ≥ 0');
    check(inRange(m.gross_value_sgd, 0, Infinity), at, 'economics.gross_value_sgd must be a number ≥ 0');
    if (m.discount_pct != null) check(inRange(m.discount_pct, 0.1, 100), at, 'economics.discount_pct must be 0–100');
    if (m.credit_value_sgd != null) {
      check(m.credit_value_sgd !== m.gross_value_sgd, at, 'credit_value_sgd repeats gross_value_sgd — omit it');
    }
  }
  if (s) {
    check(inRange(s.value, 0, 100), at, 'scores.value must be 0–100');
    check(inRange(s.accessibility, 0, 100), at, 'scores.accessibility must be 0–100');
    const composite = compositeScore(s, w);
    const grade = gradeFor(composite, bands);
    check(grade != null, at, `composite ${composite} falls outside every grade band`);
  }

  // occasion fit
  for (const [k, val] of Object.entries(e.occasion_fit || {})) {
    check(OCCASION_KEYS.includes(k), at, `unknown occasion "${k}"`);
    check(inRange(val, 0, 100), at, `occasion_fit.${k} must be 0–100`);
  }
  if (e.value_type === 'access' && e.occasion_fit) fail(at, 'access entries are excluded from occasion ranking');

  // terms
  const t = e.terms || {};
  if (t.annual_cap != null) check(typeof t.annual_cap === 'number' && t.annual_cap > 0, at, 'terms.annual_cap must be > 0');
  if (t.third_party_barred != null) check(typeof t.third_party_barred === 'boolean', at, 'terms.third_party_barred must be a boolean');
  if (t.expires != null) {
    check(isDate(t.expires), at, 'terms.expires must be YYYY-MM-DD');
    if (isDate(t.expires) && isDate(data.generated_at) && t.expires < data.generated_at) {
      warn(at, `expired on ${t.expires} — drop it or extend the date`);
    }
  }

  // locations
  (e.locations || []).forEach((loc, j) => {
    const lat = `${at} locations[${j}]`;
    check(hasWords(loc.name), lat, 'name is required');
    check(inRange(loc.lat, 1.13, 1.52), lat, `lat ${loc.lat} is outside Singapore`);
    check(inRange(loc.lng, 103.55, 104.12), lat, `lng ${loc.lng} is outside Singapore`);
    if (loc.address == null) warn(lat, 'no address — the map popup will look empty');
  });
  if (e.category === 'dining' && e.value_type === 'discount' && !(e.locations || []).length) {
    warn(at, 'a bookable dining discount with no locations never appears on the map');
  }

  // source
  check(typeof e.source === 'string' && e.source.startsWith('https://'), at, 'source must be an https URL');
});

check(outOfOrder === 0, 'entries', `${outOfOrder} entries are not sorted by id — sort them so refresh diffs stay readable`);

// ──────────────────────────────────────────────────────── parents & scenarios
const byId = new Map(entries.map((e) => [e.id, e]));

// Scenarios are checked through the same code path the page uses, so hydration
// defaults (inherited subcategories, tier_group fallbacks) apply identically.
let hydrated = null;
try {
  hydrated = hydrate(data);
} catch (err) {
  fail('scenarios', `could not hydrate the file to check scenarios: ${err.message}`);
}

for (const e of entries) {
  if (e.parent == null) continue;
  const at = `entries ${e.id}`;
  const p = byId.get(e.parent);
  if (!p) { fail(at, `parent "${e.parent}" does not match any entry id`); continue; }
  check(p.kind === 'benefit', at, `parent "${e.parent}" is itself a venue — venues cannot nest`);
  check(p.id !== e.id, at, 'an entry cannot be its own parent');
}
for (const p of entries.filter((e) => e.kind === 'benefit')) {
  const kids = entries.filter((e) => e.parent === p.id).length;
  if (p.section !== 'life' && p.value_type === 'access' && kids === 0) {
    warn(`entries ${p.id}`, 'is an unscored benefit with no venues under it — nothing will open from its card');
  }
}

// A scenario is the front door. One that matches nothing is worse than no
// scenario at all, so an empty result is an error, not a warning.
const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
check(scenarios.length > 0, 'scenarios', 'the home page needs at least one scenario');
const seenScenarios = new Set();
scenarios.forEach((s, i) => {
  const at = `scenarios[${i}] ${s.key || '(no key)'}`;
  check(/^[a-z0-9][a-z0-9-]*$/.test(s.key || ''), at, 'key must be a lowercase slug');
  check(!seenScenarios.has(s.key), at, `duplicate key "${s.key}"`);
  seenScenarios.add(s.key);
  check(hasWords(s.label), at, 'label is required');
  check(hasWords(s.blurb), at, 'blurb explains why these results, and is required');
  check(!DASH.test(s.label) && !DASH.test(s.blurb), at, 'scenario copy contains a dash');
  check(!!s.filter || !!s.view, at, 'needs either a filter or a view to route to');
  if (s.view) { check(['year'].includes(s.view), at, `unknown view "${s.view}"`); return; }
  if (!hydrated) return;

  const f = s.filter;
  for (const k of Object.keys(f)) {
    check(['kind', 'section', 'sections', 'value_type', 'value_types', 'effort', 'tier_groups',
      'occasion', 'min_occasion_fit', 'max_min_spend', 'has_expiry', 'subcategories'].includes(k),
    at, `unknown filter "${k}"`);
  }
  if (f.kind) check(KIND_KEYS.includes(f.kind), at, `unknown kind "${f.kind}"`);
  if (f.effort) check(EFFORT_KEYS.includes(f.effort), at, `unknown effort "${f.effort}"`);
  if (f.occasion) check(OCCASION_KEYS.includes(f.occasion), at, `unknown occasion "${f.occasion}"`);
  for (const g of f.tier_groups || []) check(TIER_GROUP_KEYS.includes(g), at, `unknown tier_group "${g}"`);

  // Run the real engine against hydrated entries rather than a second copy of
  // it against raw ones. The two drifted in ways that would have failed a valid
  // scenario: `subcategories` reads a field 27 ldr entries inherit at hydration
  // and do not store, and `tier_groups` reads one that defaults to "other".
  const hits = runScenario(hydrated, s).length;

  check(hits > 0, at, 'matches nothing, and a dead scenario is worse than no scenario');
  if (hits > 30) warn(at, `matches ${hits} entries — that is the overwhelm this was meant to solve`);
  else if (hits < 3) warn(at, `matches only ${hits} — thin enough to look broken`);
});

// ───────────────────────────────────────────────────────────── payback path
const steps = data.payback_path?.steps || [];
check(steps.length > 0, 'payback_path', 'at least one step is required');
let total = 0;
steps.forEach((step, i) => {
  const at = `payback_path.steps[${i}] ${step.ref}`;
  const e = byId.get(step.ref);
  if (!e) { fail(at, `ref does not match any entry id`); return; }
  const uses = step.uses ?? 1;
  check(Number.isInteger(uses) && uses >= 1, at, 'uses must be a positive integer');
  if (step.split != null) check(step.split === true, at, 'split, when present, must be true');
  const unit = e.economics?.gross_value_sgd;
  check(typeof unit === 'number', at, 'referenced entry has no economics.gross_value_sgd to total');
  if (e.terms?.annual_cap != null && uses > e.terms.annual_cap) {
    warn(at, `${uses} uses exceeds the entry's annual_cap of ${e.terms.annual_cap}`);
  }
  total += (unit || 0) * uses;
});
if (data.card?.annual_fee_sgd) {
  if (total < data.card.annual_fee_sgd) {
    warn('payback_path', `totals S$${total} but the annual fee is S$${data.card.annual_fee_sgd} — the break-even view will show an unmet path`);
  }
}

// ───────────────────────────────────────────── the schema file must be fresh
const { spawnSync } = await import('node:child_process');
const schemaCheck = spawnSync(process.execPath, [resolve(ROOT, 'scripts/build-schema.mjs'), '--check'], { encoding: 'utf8' });
if (schemaCheck.status !== 0) fail('schema', (schemaCheck.stderr || '').trim() || 'schema check failed');

// ────────────────────────────────────────────────────────────────── report
const rel = FILE.replace(`${ROOT}/`, '');
for (const line of warnings) console.warn(`  ! ${line}`);
if (errors.length) {
  console.error(`\n✕ ${rel}: ${errors.length} error(s)`);
  for (const line of errors) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`✓ ${rel}: ${entries.length} entries, ${steps.length} payback steps, ${warnings.length} warning(s) — safe to publish`);
