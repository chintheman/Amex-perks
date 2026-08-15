# Biweekly refresh checklist

The cycle is 14 days. `site/benefits-data.json` is the only file you edit.

## 1. Edit the data

Work directly in `site/benefits-data.json`. Point your editor at the schema for
autocomplete and inline errors — VS Code picks it up from `.vscode/settings.json`
in this repo, or add to any editor:

```json
"json.schemas": [
  { "fileMatch": ["benefits-data.json"], "url": "./schema/benefits-data.schema.json" }
]
```

**Adding a benefit**

1. Copy a neighbouring entry of the same shape (a scored venue, or an `access`
   entitlement — they are different shapes).
2. `id` = slug of the name: lowercase, non-alphanumerics collapsed to `-`.
3. Fill in only the fields that apply. **Never write `null`** — delete the key.
4. Insert it in `id` order.
5. Do not write `composite_score`, `grade`, `annual_value_sgd`, `net_price_sgd`,
   or a `summary` that is just the first sentence of `details`. They are derived.
6. If it is an `access` entitlement, write a `value_phrase`: the words the value
   column shows in place of a figure, 28 characters at most, no dash. Say what
   the benefit is worth rather than that you have it, and take the wording from
   the summary you just wrote (`S$800 a stay`, `1,550+ lounges`), so the column
   and the row agree. The validator rejects an access row without one.

**Changing the taxonomy** (a new tier, section, occasion or grade band)

1. Edit `scripts/taxonomy.mjs`.
2. `npm run schema` to regenerate the JSON Schema.
3. Copy the changed block into `benefits-data.json`'s `taxonomy`. The validator
   compares the two and fails if they disagree.

**Retiring a benefit** — delete the entry, then check nothing in
`payback_path.steps` still references its id (the validator will tell you).

## 2. Roll the dates

* `generated_at` → today.
* `next_refresh` → `generated_at` + 14 days. The validator enforces the arithmetic.

## 3. Validate

```bash
npm run validate      # the gate: errors block publishing, warnings need a look
npm test              # validate + v1 parity + the full page in headless Chromium
```

`npm run validate` checks, among other things:

- ids unique, slug-shaped, and sorted; entry keys in canonical order
- no `null` and no placeholder strings (`"—"`) anywhere
- every enum value legal, and `venue.tier_group` consistent with `taxonomy.tiers`
- `lifestyle` entries in section `life` and nothing else there
- scores 0–100, discounts 0–100, caps positive
- lat/lng inside Singapore's bounding box (a transposed pair fails)
- every `source` an `https://` URL
- `access` entries carry no numbers; scored entries carry both blocks
- `payback_path` refs resolve and reference entries that have a value to total
- the JSON Schema on disk is in sync with `scripts/taxonomy.mjs`

Warnings worth reading rather than ignoring:

| Warning | What to do |
| --- | --- |
| `expired on YYYY-MM-DD` | The promo is over — delete the entry or extend `terms.expires`. |
| `bookable dining discount with no locations` | It will never appear on the map. Add `locations` or accept it. |
| `N uses exceeds the entry's annual_cap` | The break-even path claims more uses than the benefit allows. |
| `payback totals S$X but the annual fee is S$Y` | The path no longer clears the fee; the view will say so. |
| `summary is N chars` | Collapsed rows will truncate it. Shorten it or move detail to `details`. |
| `name duplicates …` | Probably a double entry. |

Optionally cross-check with a standards-compliant validator:

```bash
npx ajv-cli@5 validate --spec=draft2020 -s schema/benefits-data.schema.json -d site/benefits-data.json
```

## 4. Eyeball it

```bash
npm run serve         # http://localhost:8811
```

- **Eat** — every tier group has a heading; occasion chips re-rank and re-title;
  map markers cluster over Singapore, not the ocean.
- **Payback** — the total, the row count and the "fee cleared here" marker agree
  with what you changed.
- **Browse** — the section counts add up to the total; search finds a benefit you
  just added by name, venue and cuisine.
- Toggle dark mode once.

`npm run test:page` automates all of the above; the manual pass is for judgement
(does the new copy read well) rather than mechanics.

## 5. Ship

Commit `site/benefits-data.json` on its own so the refresh diff stands alone.

---

## Re-running the v1 migration

Only needed if the original v1 file changes:

```bash
npm run migrate       # data/benefits-data.v1.json -> site/benefits-data.json
npm run test:parity   # asserts the page renders v1 and v2 identically
```

The migration **aborts** rather than writing a lossy file if any value it wants
to drop turns out not to be exactly re-derivable.

---

## Checking Amex for drift

Before editing anything, pull the source pages and diff them:

```bash
npm run sources         # renders all 11 Amex SG pages to data/sources/
git diff data/sources/  # exactly what Amex changed since the last refresh
```

`data/sources/` is committed for this reason — the reconciliation becomes a diff
rather than a re-read. A page that fails is usually Akamai bot-blocking; re-run
just that one (`npm run sources -- travel`) before assuming the page is gone.

The 11 August 2026 pass found 15 benefits missing from the file, three bundled
entries that needed splitting, and one factual error (Regional Golf listed 5
clubs; Amex says over 50). Applied by
`scripts/apply-2026-08-11-sources.mjs`, kept in the repo as a record of what
changed and why.
