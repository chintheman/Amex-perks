#!/usr/bin/env node
// Generate schema/benefits-data.schema.json from scripts/taxonomy.mjs so the
// schema's enums can never drift from the taxonomy the data is built with.
//
//   node scripts/build-schema.mjs           write the schema
//   node scripts/build-schema.mjs --check   fail if the file on disk is stale
//
// validate.mjs runs the --check for you.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATEGORY_KEYS, VALUE_TYPE_KEYS, SECTION_KEYS, TIER_GROUP_KEYS, TIER_KEYS,
  OCCASION_KEYS, GRADE_KEYS,
} from './taxonomy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'schema/benefits-data.schema.json');

const ISO_DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const SCORE = { type: 'number', minimum: 0, maximum: 100 };
const MONEY = { type: 'number', minimum: 0 };
const TEXT = { type: 'string', minLength: 1, pattern: '[A-Za-z0-9]' };
const keyed = (extra = {}) => ({
  type: 'object',
  required: ['key', 'label'],
  additionalProperties: false,
  properties: { key: { type: 'string' }, label: { type: 'string' }, ...extra },
});

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://example.invalid/amex-platinum-guide/benefits-data.schema.json',
  title: 'Amex Platinum Guide — benefits data (v2)',
  description:
    'Static data file for the Singapore Amex Platinum benefits guide. Derived values '
    + '(composite score, grade, annual value, net price, one-line summary) are NOT stored — '
    + 'guide-core.js computes them at load. Absent means absent: null is never a legal value.',
  type: 'object',
  required: ['schema_version', 'generated_at', 'card', 'scoring', 'taxonomy', 'payback_path', 'entries'],
  additionalProperties: false,
  properties: {
    schema_version: { const: 2 },
    generated_at: ISO_DATE,
    next_refresh: ISO_DATE,
    refresh_days: { type: 'integer', minimum: 1 },
    card: {
      type: 'object',
      required: ['name', 'annual_fee_sgd'],
      additionalProperties: false,
      properties: { name: TEXT, annual_fee_sgd: { type: 'number', exclusiveMinimum: 0 } },
    },
    scoring: {
      type: 'object',
      required: ['weights'],
      additionalProperties: false,
      properties: {
        weights: {
          type: 'object',
          required: ['value', 'accessibility'],
          additionalProperties: false,
          properties: { value: { type: 'number' }, accessibility: { type: 'number' } },
        },
        formula: TEXT,
        occasion_note: TEXT,
      },
    },
    taxonomy: {
      type: 'object',
      required: ['categories', 'value_types', 'sections', 'tier_groups', 'tiers', 'occasions', 'grade_bands'],
      additionalProperties: false,
      properties: {
        categories: { type: 'array', minItems: 1, items: keyed() },
        value_types: { type: 'array', minItems: 1, items: keyed({ definition: TEXT }) },
        sections: { type: 'array', minItems: 1, items: keyed({ chip: TEXT, desc: TEXT, default_subcategory: TEXT }) },
        tier_groups: { type: 'array', minItems: 1, items: keyed({ desc: TEXT }) },
        tiers: {
          type: 'object',
          minProperties: 1,
          additionalProperties: {
            type: 'object',
            required: ['label', 'group'],
            additionalProperties: false,
            properties: { label: TEXT, group: { enum: TIER_GROUP_KEYS } },
          },
        },
        occasions: { type: 'array', minItems: 1, items: keyed({ desc: TEXT }) },
        grade_bands: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['grade', 'min'],
            additionalProperties: false,
            properties: { grade: { enum: GRADE_KEYS }, min: SCORE },
          },
        },
      },
    },
    caveats: { type: 'array', items: TEXT },
    payback_path: {
      type: 'object',
      required: ['steps'],
      additionalProperties: false,
      properties: {
        steps: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['ref'],
            additionalProperties: false,
            properties: {
              ref: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
              uses: { type: 'integer', minimum: 1 },
              split: { const: true },
              condition: TEXT,
            },
          },
        },
      },
    },
    entries: { type: 'array', minItems: 1, items: { $ref: '#/$defs/entry' } },
  },
  $defs: {
    entry: {
      type: 'object',
      required: ['id', 'name', 'category', 'section', 'value_type', 'source'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
        name: TEXT,
        category: { enum: CATEGORY_KEYS },
        section: { enum: SECTION_KEYS },
        subcategory: TEXT,
        value_type: { enum: VALUE_TYPE_KEYS },
        summary: { ...TEXT, maxLength: 240 },
        details: TEXT,
        venue: { $ref: '#/$defs/venue' },
        economics: { $ref: '#/$defs/economics' },
        scores: { $ref: '#/$defs/scores' },
        occasion_fit: { $ref: '#/$defs/occasionFit' },
        terms: { $ref: '#/$defs/terms' },
        locations: { type: 'array', items: { $ref: '#/$defs/location' } },
        source: { type: 'string', pattern: '^https://[^\\s]+$' },
      },
      allOf: [
        {
          // Lifestyle lives in its own section and nowhere else.
          if: { properties: { category: { const: 'lifestyle' } }, required: ['category'] },
          then: { properties: { section: { const: 'life' } } },
          else: { properties: { section: { enum: SECTION_KEYS.filter((k) => k !== 'life') } } },
        },
        {
          // `access` entitlements are unscored by design — no numbers at all.
          if: { properties: { value_type: { const: 'access' } }, required: ['value_type'] },
          then: {
            properties: { economics: false, scores: false },
            required: ['summary', 'details'],
          },
          else: { required: ['scores', 'economics'] },
        },
      ],
    },
    venue: {
      type: 'object',
      additionalProperties: false,
      properties: {
        group: TEXT,
        cuisine: TEXT,
        tier: { enum: TIER_KEYS },
        tier_group: { enum: TIER_GROUP_KEYS },
        pax: { type: 'integer', minimum: 1 },
        fixed_set: { const: true },
        set_price_sgd: MONEY,
      },
      dependentRequired: { tier: ['tier_group'], tier_group: ['tier'], set_price_sgd: ['fixed_set'] },
    },
    economics: {
      type: 'object',
      required: ['min_spend_sgd', 'gross_value_sgd'],
      additionalProperties: false,
      properties: {
        min_spend_sgd: MONEY,
        gross_value_sgd: MONEY,
        discount_pct: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
        min_spend_to_activate: MONEY,
        credit_value_sgd: MONEY,
      },
    },
    scores: {
      type: 'object',
      required: ['value', 'accessibility'],
      additionalProperties: false,
      properties: { value: SCORE, accessibility: SCORE },
    },
    occasionFit: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: Object.fromEntries(OCCASION_KEYS.map((k) => [k, SCORE])),
    },
    terms: {
      type: 'object',
      additionalProperties: false,
      properties: {
        annual_cap: { type: 'number', exclusiveMinimum: 0 },
        advance: TEXT,
        condition: TEXT,
        third_party_barred: { type: 'boolean' },
        expires: ISO_DATE,
      },
    },
    location: {
      type: 'object',
      required: ['name', 'lat', 'lng'],
      additionalProperties: false,
      properties: {
        name: TEXT,
        // Singapore bounding box — a transposed lat/lng lands outside it.
        lat: { type: 'number', minimum: 1.13, maximum: 1.52 },
        lng: { type: 'number', minimum: 103.55, maximum: 104.12 },
        address: TEXT,
      },
    },
  },
};

const text = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== text) {
    console.error('✕ schema/benefits-data.schema.json is stale — run: node scripts/build-schema.mjs');
    process.exit(1);
  }
  console.log('✓ JSON Schema is in sync with taxonomy.mjs');
} else {
  writeFileSync(OUT, text);
  console.log(`✓ wrote ${OUT.replace(`${ROOT}/`, '')}`);
}
