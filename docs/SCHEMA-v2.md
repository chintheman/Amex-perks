# benefits-data.json — v2 schema

The machine-readable contract is [`schema/benefits-data.schema.json`](../schema/benefits-data.schema.json)
(JSON Schema 2020-12, generated from [`scripts/taxonomy.mjs`](../scripts/taxonomy.mjs)).
This document explains the shape and the reasoning behind it.

## Three rules

1. **Absent means absent.** `null` is never a legal value anywhere in the file.
   A field that does not apply is simply not written. This is what makes the
   discriminated shapes below readable — an `access` entry has no `economics`
   key at all rather than eleven nulls.
2. **Nothing derivable is stored.** If the page can compute it from other
   fields, `guide-core.js` computes it at load. See [Derived values](#derived-values).
3. **Taxonomy lives in the file.** Section, tier group, value type, occasion and
   grade band definitions all ship inside `taxonomy`. The page reads labels and
   bucket rules from the data; it no longer pattern-matches free text.

## Top level

| Key | Type | Notes |
| --- | --- | --- |
| `schema_version` | `2` | The loader refuses anything else. |
| `generated_at` | `YYYY-MM-DD` | The date the data was last verified. |
| `next_refresh` | `YYYY-MM-DD` | `generated_at + refresh_days`; the validator enforces it. |
| `refresh_days` | integer | 14. |
| `card` | object | `{ name, annual_fee_sgd }`. |
| `scoring` | object | `weights` (must sum to 1), plus the `formula` and `occasion_note` prose. |
| `taxonomy` | object | See below. |
| `caveats` | string[] | Shown in the methodology modal. |
| `payback_path` | object | Ordered references — see [Break-even path](#break-even-path). |
| `entries` | object[] | Sorted by `id`. |

### `taxonomy`

* `categories` — `dining`, `lifestyle`.
* `value_types` — `discount`, `free`, `credit`, `access`, each with the
  `definition` the methodology modal prints.
* `sections` — the five Browse buckets. Each has `label`, `chip`, `desc`, and
  optionally `default_subcategory` (see [`subcategory`](#subcategory)).
* `tier_groups` — the seven Eat buckets, with the `desc` shown under each heading.
* `tiers` — `{ tier: { label, group } }`. The mapping from a venue tier to its
  Eat bucket. Adding a tier here is the only step needed to support it.
* `occasions` — `date_night`, `business`, `free_treat`.
* `grade_bands` — ordered high → low, each `{ grade, min }`; `min` is inclusive
  and the last band must reach 0 so every score gets a grade.

## Entry

Keys always appear in this order, and every optional one is omitted when empty:

```jsonc
{
  "id": "bacha-coffee",                 // slug of the name; stable across refreshes
  "name": "Bacha Coffee",
  "category": "dining",                 // taxonomy.categories
  "section": "ldr",                     // taxonomy.sections — explicit, never inferred
  "subcategory": "Spa & Wellness",      // only when it differs from the section default
  "value_type": "discount",             // taxonomy.value_types
  "summary": "…",                       // only when it is NOT the first sentence of details
  "details": "Weekday only, ≤48h advance booking. Excl. beverages, bakery, desserts, set menus.",

  "venue": {                            // bookable-venue facts; absent on pure entitlements
    "group": "The Capitol Kempinski",   // parent hotel / restaurant group
    "cuisine": "Café / Dessert",
    "tier": "cafe",                     // taxonomy.tiers
    "tier_group": "casual",             // must equal taxonomy.tiers[tier].group
    "pax": 2,                           // party size the offer is priced for
    "fixed_set": true,                  // set menu at a fixed price
    "set_price_sgd": 98                 // requires fixed_set
  },

  "economics": {                        // absent on `access` entries
    "min_spend_sgd": 90,
    "gross_value_sgd": 45,              // value of one use
    "discount_pct": 50,
    "min_spend_to_activate": 0,         // credits only
    "credit_value_sgd": 200             // only when it differs from gross_value_sgd
  },

  "scores": { "value": 100, "accessibility": 85 },   // 0–100 inputs; absent on `access`

  "occasion_fit": { "date_night": 72.5, "business": 60 },   // only the occasions that apply

  "terms": {
    "annual_cap": 12,                   // uses per year
    "advance": "Varies 0–2 days by outlet",
    "condition": "Booking Required",    // short friction label, used by the break-even list
    "third_party_barred": true,
    "expires": "2026-08-31"             // promos only
  },

  "locations": [{ "name": "…", "lat": 1.3039, "lng": 103.8318, "address": "…" }],
  "source": "https://www.americanexpress.com/…"
}
```

### Discriminated shapes

There is one entry type with two conditional shapes, enforced by the schema's
`if`/`then`:

* **`value_type: "access"`** (8 rows — lounges, insurance, concierge, status)
  carry no `economics` and no `scores`, because scoring an insurance policy is
  false precision. They must carry both a `summary` and `details`.
* **Everything else** must carry `economics` and `scores`.

`venue` is present on anything with a physical or tiered venue, which is not the
same as `category: "dining"` — the golf programme and the spa offers are
`lifestyle` but still have a tier and a cuisine label.

### `subcategory`

`section` is the enum the UI groups by. `subcategory` is the human label shown
in search and in fallback text. Three sections have exactly one label across
every row (`Love Dining · Restaurant`, `Love Dining · Hotel Outlet`,
`Dining Promotions`), so that label lives on the section as
`default_subcategory` and the 75 entries in them store nothing. The validator
rejects an entry whose `subcategory` merely repeats its section default.

## Derived values

None of these are in the file. `guide-core.js` computes them in `hydrate()`,
and `scripts/validate.mjs` imports the same functions, so the page and the gate
can never disagree.

| Value | Rule |
| --- | --- |
| `composite_score` | `0.6 × scores.value + 0.4 × scores.accessibility`, rounded to 1 dp. Weights come from `scoring.weights`. |
| `grade` | The first `taxonomy.grade_bands` entry whose `min` the composite reaches. |
| `annual_value_sgd` | `economics.gross_value_sgd × terms.annual_cap`. |
| `net_price_sgd` | `min_spend_sgd` for credits and fixed-set menus, otherwise `max(0, min_spend_sgd − gross_value_sgd)`. |
| `summary` | The first sentence of `details`, abbreviation-aware (`min.`, `incl.`, `excl.` do not end a sentence), truncated at 110 chars. An explicit `summary` overrides it. |
| `gist` | `cuisine · venue group · summary` — the one-line row label. |

v1 stored all six. Two of them had already drifted: `discount_pct` duplicated
`pct2`, and `credit_value_sgd`/`value_sgd` duplicated `gross_value_sgd` on every
row that had them.

## Break-even path

v1 repeated benefit names, hand-copied values and pasted 150-character
truncations of the notes into `condition`. Any of those could drift from
`entries` on a refresh, and the truncations were cut mid-word.

v2 stores ordered references only:

```jsonc
"payback_path": {
  "steps": [
    { "ref": "global-dining-credit", "uses": 1 },
    { "ref": "complimentary-hotel-stay-credit-fhr-hotel-collection", "uses": 2 },
    { "ref": "table-for-two-platinum-edition", "uses": 3, "split": true }
  ]
}
```

* `ref` — an entry `id`. A dangling ref fails validation.
* `uses` — how many times the benefit is used. Value is `uses × gross_value_sgd`.
* `split: true` — render one row per use (`… (use 1 of 3)`) instead of one
  combined row. This is presentation only; the total is identical.
* `condition` — optional override. Otherwise the row shows the entry's
  `terms.condition`, falling back to its summary.

Totals, cumulative figures, the progress bar and the "fee cleared here" marker
are all computed in `paybackView()`.

## Identifiers

v1 used positional ids (`scored-057`, `access-003`). Inserting a benefit
renumbered its neighbours, so a two-row change produced a whole-file diff, and
a reference to `scored-057` told a reviewer nothing.

v2 ids are slugs of the name (`princess-terrace-tien-court-connections`). They
are stable when the list grows, they make `payback_path` refs readable, and
sorting entries by id gives the refresh a diff you can actually review.
[`data/id-map.v1-v2.json`](../data/id-map.v1-v2.json) maps every old id to its
new one.

## Size

| | v1 | v2 |
| --- | --- | --- |
| Payload (minified) | 83.9 KB | 75.6 KB |
| On disk | 83.9 KB (minified) | 109 KB (pretty-printed, for reviewable diffs) |
| Stored fields per entry | up to 34, nulls included | 6 required + only what applies |

Ship the minified form if the extra 33 KB matters; nothing in the page depends
on the whitespace.
