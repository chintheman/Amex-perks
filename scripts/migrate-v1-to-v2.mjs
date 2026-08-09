#!/usr/bin/env node
// Convert benefits-data v1 (flat, 98 entries) -> v2.
//
//   node scripts/migrate-v1-to-v2.mjs [in=data/benefits-data.v1.json] [out=site/benefits-data.json]
//
// Lossless by construction: every v1 field is either carried over, renamed, or
// dropped only after this script has PROVEN it is exactly re-derivable. Any
// value that fails its derivation check aborts the run rather than being
// silently rounded away — see `assertDerivable`.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORIES, VALUE_TYPES, SECTIONS, TIER_GROUPS, TIERS, OCCASIONS,
  GRADE_BANDS, SCORING, V1_SUBCATEGORY_TO_SECTION,
} from './taxonomy.mjs';
import { compositeScore, gradeFor, annualValue, netPrice, summaryOf } from '../site/guide-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN = resolve(ROOT, process.argv[2] || 'data/benefits-data.v1.json');
const OUT = resolve(ROOT, process.argv[3] || 'site/benefits-data.json');
const ID_MAP_OUT = resolve(ROOT, 'data/id-map.v1-v2.json');

const REFRESH_DAYS = 14;

const problems = [];
const note = (msg) => problems.push(msg);

// ---------------------------------------------------------------- id slugs
const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/, '');

function makeIds(entries) {
  const used = new Map();
  const map = {};
  for (const e of entries) {
    const base = slug(e.name) || 'benefit';
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    map[e.id] = n === 1 ? base : `${base}-${n}`;
  }
  return map;
}

// ------------------------------------------------------------ summary/details
const hasWords = (s) => typeof s === 'string' && /[a-z0-9]/i.test(s);

// ------------------------------------------------------------------- helpers
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-6;

function assertDerivable(label, id, stored, derived) {
  if (stored == null) return;
  if (!near(stored, derived)) {
    note(`${id}: ${label} stored ${stored} but derives to ${derived} — kept v1 value would be lost`);
  }
}

// Drop a key only when it duplicates another field exactly.
function assertDuplicate(label, id, a, b) {
  if (a == null) return true;
  if (a === b) return true;
  note(`${id}: ${label} (${a}) is not a duplicate of ${b} — not safe to drop`);
  return false;
}

const compact = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (!Array.isArray(v) && typeof v === 'object' && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
};

// ------------------------------------------------------------------ entries
function convertEntry(e, ids) {
  const id = ids[e.id];
  const category = e.benefit_category;
  const isDining = category === 'dining';
  const section = isDining ? (V1_SUBCATEGORY_TO_SECTION[e.subcategory] || 'progs') : 'life';
  // Three sections have one label for every row in them — it lives on the
  // section, not repeated 75 times. Only genuine overrides are stored.
  const sectionDefault = SECTIONS.find((s) => s.key === section)?.default_subcategory ?? null;
  const subcategory = e.subcategory === sectionDefault ? null : e.subcategory;

  // --- prose
  const details = hasWords(e.details) ? e.details.trim()
    : hasWords(e.notes) ? e.notes.trim()
    : null;
  if (e.notes != null && !hasWords(e.notes)) {
    // v1 sentinel: notes === "—". v2 omits the field instead.
    if (e.notes.trim() !== '—') note(`${id}: unexpected sentinel note ${JSON.stringify(e.notes)}`);
  }
  // v1 kept the long prose in `notes` and, only on the 8 unscored `access`
  // rows, an authored `summary` + `details` pair. v2 always names the prose
  // `details` and stores `summary` ONLY where it is not simply the first
  // sentence — everywhere else summaryOf() reproduces it at load.
  const authored = hasWords(e.summary) ? e.summary.trim() : null;
  const summary = authored && authored !== summaryOf(details, null) ? authored : null;

  // --- venue block (bookable-venue shape; absent on pure entitlements)
  const tier = e.tier ?? null;
  if (tier && !TIERS[tier]) note(`${id}: unknown tier "${tier}"`);
  const venue = compact({
    group: e.venue_group ?? null,
    cuisine: e.cuisine ?? null,
    tier,
    tier_group: tier ? TIERS[tier]?.group ?? 'other' : null,
    pax: num(e.set_pax),
    fixed_set: e.fixed_set === true ? true : null,
    set_price_sgd: num(e.set_price),
  });

  // --- economics (absent on `access` entries, which carry no numbers at all)
  // discount_pct: v1 duplicated this as `pct2` (% off for a party of two).
  // Verified identical wherever both exist, so v2 keeps one field.
  assertDuplicate('pct2', id, num(e.pct2), num(e.discount_pct));
  // credit_value_sgd / value_sgd duplicated gross_value_sgd on every row that had them.
  const dropCredit = assertDuplicate('credit_value_sgd', id, num(e.credit_value_sgd), num(e.gross_value_sgd));
  assertDuplicate('value_sgd', id, num(e.value_sgd), num(e.gross_value_sgd));

  const economics = compact({
    min_spend_sgd: num(e.min_spend_sgd),
    gross_value_sgd: num(e.gross_value_sgd),
    discount_pct: num(e.discount_pct) ?? num(e.pct2),
    min_spend_to_activate: num(e.min_spend_to_activate),
    credit_value_sgd: dropCredit ? null : num(e.credit_value_sgd),
  });
  assertDerivable('net_price_sgd', id, num(e.net_price_sgd),
    netPrice(economics, e.value_type, venue.fixed_set === true));

  // --- scores: value + accessibility are inputs; composite and grade derive.
  const scores = compact({ value: num(e.value_score), accessibility: num(e.accessibility_score) });
  const derivedComposite = compositeScore(scores, SCORING.weights);
  assertDerivable('composite_score', id, num(e.composite_score), derivedComposite);
  assertDerivable('annual_value_sgd', id, num(e.annual_value_sgd), annualValue(num(e.gross_value_sgd), num(e.annual_cap)));
  if (e.grade != null && e.grade !== gradeFor(derivedComposite, GRADE_BANDS)) {
    note(`${id}: grade ${e.grade} does not match band for composite ${derivedComposite}`);
  }

  // --- occasion fit: keep only the scored occasions (v1 wrote nulls for the rest)
  const occasion_fit = {};
  for (const [k, v] of Object.entries(e.occasion_fit || {})) if (num(v) != null) occasion_fit[k] = v;

  const terms = compact({
    annual_cap: num(e.annual_cap),
    advance: e.advance ?? null,
    condition: e.condition ?? null,
    third_party_barred: typeof e.third_party_barred === 'boolean' ? e.third_party_barred : null,
    expires: e.expires ?? null,
  });

  const locations = (e.locations || []).map((l) =>
    compact({ name: l.name, lat: l.lat, lng: l.lng, address: l.address ?? null }));

  // Fixed key order — diffs on the 14-day refresh stay readable.
  return compact({
    id,
    name: e.name,
    category,
    section,
    subcategory,
    value_type: e.value_type,
    summary,
    details,
    venue,
    economics,
    scores,
    occasion_fit,
    terms,
    locations,
    source: e.source,
  });
}

// ------------------------------------------------------------- payback path
// v1 repeated names, hand-copied values and 150-char truncated `condition`
// strings. v2 stores ordered references; every number derives from the entry.
function convertPayback(v1, entriesById, idsByName) {
  const steps = [];
  for (const step of v1.path) {
    const base = step.name.replace(/\s*\(use \d+\)\s*$/, '').trim();
    const id = idsByName.get(base);
    if (!id) { note(`payback: no entry matches "${step.name}"`); continue; }
    const entry = entriesById.get(id);
    const unit = entry.economics?.gross_value_sgd ?? null;

    const prev = steps[steps.length - 1];
    const isRepeat = /\(use \d+\)\s*$/.test(step.name);
    if (isRepeat && prev && prev.ref === id) { prev.uses += 1; continue; }

    const uses = Math.round(step.value_sgd / (unit || step.value_sgd));
    if (!isRepeat && !near(step.value_sgd, (unit ?? 0) * uses)) {
      note(`payback "${base}": v1 value ${step.value_sgd} is not a whole multiple of gross value ${unit}`);
    }
    steps.push(compact({ ref: id, uses: isRepeat ? 1 : uses, split: isRepeat || null }));
  }
  return { steps };
}

// ------------------------------------------------------------------- run it
const v1 = JSON.parse(readFileSync(IN, 'utf8'));
const ids = makeIds(v1.entries);
const entries = v1.entries.map((e) => convertEntry(e, ids)).sort((a, b) => a.id.localeCompare(b.id));
const entriesById = new Map(entries.map((e) => [e.id, e]));
const idsByName = new Map(v1.entries.map((e) => [e.name, ids[e.id]]));

const nextRefresh = new Date(new Date(`${v1.generated_at}T00:00:00Z`).getTime() + REFRESH_DAYS * 86400000)
  .toISOString().slice(0, 10);

const v2 = {
  schema_version: 2,
  generated_at: v1.generated_at,
  next_refresh: nextRefresh,
  refresh_days: REFRESH_DAYS,
  card: v1.card,
  scoring: {
    ...SCORING,
    formula: v1.methodology.formula,
    occasion_note: v1.methodology.occasion_note,
  },
  taxonomy: {
    categories: CATEGORIES,
    value_types: VALUE_TYPES.map((t) => ({ ...t, definition: v1.methodology.value_types[t.key] })),
    sections: SECTIONS,
    tier_groups: TIER_GROUPS,
    tiers: TIERS,
    occasions: OCCASIONS,
    grade_bands: GRADE_BANDS,
  },
  caveats: v1.methodology.caveats,
  payback_path: convertPayback(v1.payback_path, entriesById, idsByName),
  entries,
};

if (problems.length) {
  console.error(`\n✕ migration blocked — ${problems.length} unresolved issue(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

writeFileSync(OUT, `${JSON.stringify(v2, null, 2)}\n`);
writeFileSync(ID_MAP_OUT, `${JSON.stringify(ids, null, 2)}\n`);

// v1 shipped minified; v2 is pretty-printed so the biweekly diff is readable.
// Compare like for like — minified vs minified — when reporting the saving.
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const minLen = (obj) => Buffer.byteLength(JSON.stringify(obj));
const before = minLen(v1);
const after = minLen(v2);
console.log(`✓ ${entries.length} entries · ${v2.payback_path.steps.length} payback steps`);
console.log(`  ${OUT.replace(`${ROOT}/`, '')}  ${kb(readFileSync(OUT).length)} on disk (pretty-printed)`);
console.log(`  payload ${kb(after)} minified, down ${((1 - after / before) * 100).toFixed(0)}% from v1's ${kb(before)}`);
console.log(`  ${ID_MAP_OUT.replace(`${ROOT}/`, '')}  v1 id → v2 id`);
