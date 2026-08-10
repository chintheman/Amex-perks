# Amex Platinum Guide — Singapore

An unofficial, independent guide to every American Express Platinum benefit in
Singapore. A static page over a single JSON file.

You land on **eight scenarios** — date night, enrol and forget, ending soon,
flying somewhere — because most people do not know what they are looking for.
Underneath, the 121 rows are split into the **42 benefits** your card actually
gives you and the **79 places** to spend them, grouped by what you have to do:
**claim** it once, **book** it each time, or you already **have** it.

Not affiliated with or endorsed by American Express.

```bash
npm install          # dev-only; the site itself has no dependencies
npm run serve        # http://localhost:8811
npm test             # validate the data, prove v1 parity, drive the real page
```

## What's here

```
site/                 the published site — copy this directory to any static host
  index.html          the whole UI: one page, one ES module, no framework
  guide-core.js       pure helpers + hydrate(): the data ↔ view adaptation layer
  benefits-data.json  the data (v2)
  assets/             optional hero photo
schema/
  benefits-data.schema.json   JSON Schema 2020-12, generated from taxonomy.mjs
scripts/
  taxonomy.mjs        single source of truth for sections, tiers, occasions, bands
  build-schema.mjs    regenerates the JSON Schema (--check fails if stale)
  migrate-v1-to-v2.mjs  v1 → v2, aborts rather than losing a value
  validate.mjs        the pre-publish gate
  test-parity.mjs     asserts v2 renders exactly what v1 did
  test-page.mjs       drives all three views in headless Chromium
data/
  benefits-data.v1.json   the original file, kept for the parity test
  id-map.v1-v2.json       old id → new id
docs/
  SCHEMA-v2.md        the schema and why it is shaped this way
  REFRESH.md          the 14-day refresh checklist
  UI-CHANGES.md       what changed on the page side
```

## The data model in one paragraph

One JSON file, fetched by the page. Every entry carries explicit taxonomy keys
(`section`, `venue.tier_group`) instead of free text the UI pattern-matches, so
a typo fails validation rather than silently dropping a benefit into a fallback
bucket. Nothing derivable is stored — the composite score, grade, annual value,
net price and one-line summary are computed at load by `guide-core.js`, which
the validator imports too, so the page and the gate cannot disagree. `null` is
never written; a field that does not apply is absent, which is what lets the
eight unscored `access` entitlements share a file with the 90 scored offers
without carrying a dozen empty columns each. The break-even path stores ordered
references to entry ids rather than copied names and figures, so it cannot drift
from `entries` on a refresh. Full detail in [docs/SCHEMA-v2.md](docs/SCHEMA-v2.md).

## Refreshing the data

Every 14 days. Edit `site/benefits-data.json`, roll the dates, run
`npm run validate`, eyeball the three views. Step by step in
[docs/REFRESH.md](docs/REFRESH.md).

## Tests

| Command | What it proves |
| --- | --- |
| `npm run validate` | The data file is publishable: enums legal, refs resolve, no nulls, ids sorted and unique, coordinates in Singapore, schema in sync. |
| `npm run test:parity` | Every entry and every break-even row renders identically to v1 — the migration lost nothing. |
| `npm run test:page` | The real page in headless Chromium: all three views, expansion, occasion ranking, search, sort, section filter, reset, modal, theme persistence, zero console errors. |

`npm run test:page` needs a browser once: `npx playwright install chromium`.

## Credits

Map tiles © OpenStreetMap contributors, © CARTO. Figures are estimates —
reconfirm terms with Amex or the venue before relying on a benefit.
