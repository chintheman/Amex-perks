#!/usr/bin/env node
// Prove the v1 → v2 migration is lossless *as the page sees it*: hydrate the
// v2 file and compare every field the UI reads against the original v1 entry,
// then compare the rendered break-even table row for row.
//
//   node scripts/test-parity.mjs
//
// The only differences this tolerates are the two deliberate ones listed in
// UI-CHANGES.md; both are printed so a regression cannot hide among them.

import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrate, paybackView, fmtMoney } from '../site/guide-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

// Compare v1 against a FRESH migration, not against site/benefits-data.json —
// the published file is edited on every refresh, and those edits are supposed
// to change it. What must never change is what the migration produces from v1.
const out = join(tmpdir(), `benefits-parity-${process.pid}.json`);
const run = spawnSync(process.execPath, [resolve(ROOT, 'scripts/migrate-v1-to-v2.mjs'), 'data/benefits-data.v1.json', out], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(`✕ parity: the migration itself failed\n${run.stderr || run.stdout}`);
  process.exit(1);
}

const v1 = read('data/benefits-data.v1.json');
const idMap = read('data/id-map.v1-v2.json');
const data = hydrate(JSON.parse(readFileSync(out, 'utf8')));
rmSync(out, { force: true });

const failures = [];
const expected = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// v1's implicit taxonomy rules, copied verbatim from the original guide-core.js
// so the comparison is against the OLD behaviour, not the new one.
const V1_TIER_GROUPS = [
  ['fine', ['fine', 'ultra']], ['upscale', ['upscale']], ['casual', ['mid', 'casual', 'cafe']],
  ['buffet', ['buffet', 'buffet_premium']], ['hightea', ['high_tea']], ['bar', ['bar']],
];
const v1TierGroup = (e) => V1_TIER_GROUPS.find(([, tiers]) => tiers.includes(e.tier))?.[0] || 'other';
const v1Section = (e) => {
  if (e.benefit_category !== 'dining') return 'life';
  if (e.subcategory === 'Love Dining · Restaurant') return 'ldr';
  if (e.subcategory === 'Love Dining · Hotel Outlet') return 'ldh';
  if (e.subcategory === 'Dining Promotions') return 'promo';
  return 'progs';
};

// ─────────────────────────────────────────────────────────── entry parity
const FIELDS = [
  ['name', (e) => e.name],
  ['category', (e) => e.benefit_category],
  ['value_type', (e) => e.value_type],
  ['subcategory', (e) => e.subcategory],
  ['section', v1Section],
  ['tier_group', v1TierGroup],
  ['venue_group', (e) => e.venue_group ?? null],
  ['cuisine', (e) => e.cuisine ?? null],
  ['tier', (e) => e.tier ?? null],
  ['pax', (e) => e.set_pax ?? null],
  ['fixed_set', (e) => e.fixed_set === true],
  ['set_price_sgd', (e) => e.set_price ?? null],
  ['min_spend_sgd', (e) => e.min_spend_sgd ?? null],
  ['gross_value_sgd', (e) => e.gross_value_sgd ?? null],
  ['net_price_sgd', (e) => e.net_price_sgd ?? null],
  ['discount_pct', (e) => e.discount_pct ?? null],
  ['annual_value_sgd', (e) => e.annual_value_sgd ?? null],
  ['annual_cap', (e) => e.annual_cap ?? null],
  ['value_score', (e) => e.value_score ?? null],
  ['accessibility_score', (e) => e.accessibility_score ?? null],
  ['composite_score', (e) => e.composite_score ?? null],
  ['grade', (e) => e.grade ?? null],
  ['advance', (e) => e.advance ?? null],
  ['condition', (e) => e.condition ?? null],
  ['third_party_barred', (e) => e.third_party_barred ?? null],
  ['expires', (e) => e.expires ?? null],
  ['source', (e) => e.source],
  ['locations', (e) => (e.locations || []).map((l) => ({ name: l.name, lat: l.lat, lng: l.lng, address: l.address ?? null }))],
  ['occasion_fit', (e) => Object.fromEntries(Object.entries(e.occasion_fit || {}).filter(([, v]) => v != null))],
  // The expanded-card body. v1: summary || notes || details.
  ['body', (e) => e.summary || e.notes || e.details || ''],
];

for (const old of v1.entries) {
  const id = idMap[old.id];
  const now = data.byId.get(id);
  if (!now) { failures.push(`${old.id} → ${id}: missing from v2`); continue; }

  for (const [field, from] of FIELDS) {
    const want = from(old);
    let got = field === 'body' ? (now.details || now.summary || '') : now[field];
    if (field === 'locations') got = got.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng, address: l.address ?? null }));
    if (eq(want, got)) continue;

    // The two documented changes.
    if (field === 'body' && old.value_type === 'access' && got === old.details) {
      expected.push(`${id}: expanded body now shows the fuller \`details\` instead of the one-liner`);
      continue;
    }
    // Pain point 5: v1 wrote "—" where there was nothing to say.
    if (field === 'body' && want === '—' && got === '') {
      expected.push(`${id}: placeholder "—" body is now genuinely empty`);
      continue;
    }
    failures.push(`${id}.${field}: v1 ${JSON.stringify(want)} !== v2 ${JSON.stringify(got)}`);
  }
}

// v1 wrote "—" into notes where there was nothing to say; v2 omits the field.
for (const old of v1.entries) {
  if (old.notes === '—' && data.byId.get(idMap[old.id]).details !== null) {
    failures.push(`${idMap[old.id]}: sentinel note survived the migration`);
  }
}

// ───────────────────────────────────────────────────────── payback parity
const pb = paybackView(data);
const want = v1.payback_path.path.map((s, i) => ({
  num: String(i + 1), plus: `+${fmtMoney(s.value_sgd)}`, cum: `cum. ${fmtMoney(s.cumulative_sgd)}`,
}));
const got = pb.steps.map((s) => ({ num: s.num, plus: s.plus, cum: s.cum }));
if (!eq(want, got)) failures.push(`payback rows differ:\n    v1 ${JSON.stringify(want)}\n    v2 ${JSON.stringify(got)}`);
if (pb.totalSgd !== v1.payback_path.total_sgd) {
  failures.push(`payback total: v1 ${v1.payback_path.total_sgd} !== v2 ${pb.totalSgd}`);
}
if (pb.clearedFee !== v1.payback_path.cleared_fee) failures.push('payback cleared_fee differs');
// v1's `condition` strings were notes truncated mid-word at 150 chars; v2
// derives them from the entry, so only the fact that every row HAS one is
// asserted here.
for (const s of pb.steps) if (!s.condition) failures.push(`payback step ${s.num}: no condition text`);

// ──────────────────────────────────────────────────────────────── report
if (expected.length) {
  console.log(`  ~ ${expected.length} intentional difference(s) (see UI-CHANGES.md):`);
  for (const line of expected.slice(0, 3)) console.log(`    ${line}`);
  if (expected.length > 3) console.log(`    …and ${expected.length - 3} more of the same kind`);
}
if (failures.length) {
  console.error(`\n✕ parity: ${failures.length} unexpected difference(s)`);
  for (const line of failures.slice(0, 40)) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`✓ parity: ${v1.entries.length} entries and ${pb.steps.length} payback rows render identically to v1`);
