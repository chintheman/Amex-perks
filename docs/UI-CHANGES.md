# UI-side changes

## Part 2 — the scenario-first rebuild (11 Aug 2026)

The page no longer opens on a task picker over a flat list of everything. It
opens on **eight scenarios**, and the full list is grouped by **what you have to
do about it**.

### Views

| Was | Is |
| --- | --- |
| Eat / Payback / Browse — three peers | Home / Places to eat / Payback, with Home as the front door |
| Browse: 5 Amex sections, 98 flat rows | Home: 8 scenario tiles, then 42 benefits under Claim / Book / Have |
| Restaurants and insurance policies in one list | 42 benefits on Home; the 79 venues live behind the benefit that spends them |
| Break-even was tab 2 | The claimable figure is in the hero on every view; the calculator is a scenario |

### New in `guide-core.js`

* `runScenario(data, scenario)`, the filter engine. Every predicate maps to one
  key in `scenarios[].filter`; unknown keys fail validation rather than silently
  matching everything.
* `logSummary(data, log)`, `logUse`, `usesLeft`, `canLog` — the year log's
  arithmetic. Storage stays in the page, so both halves are testable alone.
* `hydrate()` now attaches `children` and `childCount` to every entry, and
  exposes `data.benefits` and `data.venues`.

### Things that bit, and are now covered by tests

* **Two `#pbg-map` elements.** The results view mounts its own map container
  while the places view has a static one, so `getElementById` handed the wrong
  node to Leaflet. Each view now owns a distinctly-named container, and the page
  test fails on any duplicate id in any view.
* **`_leaflet_pos` on a dead map.** `fitBounds` animates by default; switching
  view mid-animation destroyed the map while frames were still queued, and
  Leaflet threw reading a pane it no longer had. Fixed by fitting without
  animation, tearing the instance down before its container is removed, and
  tokenising the mount retry so a queued attempt from a previous render cannot
  build a map in a container that has since been hidden.

---

## Part 1 — moving to the v2 schema

The adaptation layer is `site/guide-core.js`. It is still a module of pure
helpers; `hydrate()` is the only new concept. Everything the view code reads is
the same flat shape as before, so the changes below are all it took.

## The one structural change

`loadData()` now returns `hydrate(raw)` instead of the parsed JSON:

```js
const data = await core.loadData();   // { ...raw, tax, entries, byId }
```

* `entries` — flattened, with derived fields filled in. `e.venue_group`,
  `e.composite_score`, `e.grade`, `e.annual_value_sgd`, `e.net_price_sgd`,
  `e.summary` and `e.gist` all exist exactly as the old code expected, even
  though the file no longer stores them.
* `tax` — the taxonomy from the file plus `sectionByKey` / `tierGroupByKey` /
  `valueTypeByKey` / `categoryByKey` lookups.
* `byId` — `Map` of id → entry, used by the break-even view.

Everything else is a rename.

## Lookups that got simpler

| v1 | v2 |
| --- | --- |
| `sectionKey(e)` matched `e.subcategory` against three hard-coded strings and fell through to `'progs'` | `e.section` — stored |
| `tierGroupKey(e)` scanned a `TIER_GROUPS` table for `e.tier` and fell through to `'other'` | `e.tier_group` — stored |
| `SECTIONS`, `TIER_GROUPS`, `OCCASIONS` were module constants | `data.tax.sections`, `.tier_groups`, `.occasions` |
| `CAT_META[k].label` / `TYPE_META[k].label` | `data.tax.categoryByKey[k].label` / `valueTypeByKey[k].label` |
| `data.methodology.value_types[t]` | `data.tax.value_types[i].definition` |
| `data.methodology.grade_bands` (object of strings) | `data.tax.grade_bands` (array of `{grade, min}`) |
| `data.methodology.caveats` | `data.caveats` |
| `e.benefit_category` | `e.category` |
| `gist(e)` truncated `e.notes` at 84 characters | `e.gist`, built from the derived `summary` |

The colour maps (`CAT_VAR`, `TYPE_VAR`, `GRADE_VAR`) stayed in `guide-core.js`
— they map taxonomy keys to CSS custom properties, which is presentation, not
data.

Both fall-through cases are gone. In v1 a typo in `subcategory` or `tier`
silently dropped a benefit into "Credits & extras" or "Seasonal, Credits &
Programs"; in v2 those keys are enums the validator checks, so the same typo
fails before publishing.

## The break-even view

`paybackView(data)` now resolves references instead of reading a denormalised
list. Its return value gained three fields (`totalSgd`, `clearedFee`, and `id`
on each row) and is otherwise unchanged, so the view code that renders the rows
did not move.

Row conditions used to be whatever 150-character truncation of the notes was
pasted into the data. They now come from the entry's `terms.condition`, falling
back to its summary — so they read as complete phrases and cannot drift from
the benefit they describe.

## Two deliberate rendering differences

Both are asserted in `scripts/test-parity.mjs`, which fails on any *other*
difference between what v1 and v2 render:

1. **Empty notes are empty.** Seven entries had `notes: "—"`. v1 printed the
   dash inside the expanded card and `gist()` had a regex to scrub it. v2 omits
   the field; the expanded card shows the badges and the source link only.
2. **`access` entries show their full text.** v1's expanded body was
   `summary || notes || details`, so for the eight entitlement rows it printed
   the one-line summary and `details` — the substantive paragraph about guest
   allowances, coverage limits and 2026 policy changes — was never rendered
   anywhere. v2 prefers `details` in the expanded body and keeps the summary for
   the collapsed row.

Everything else — every number, badge, grade, group heading, sort order, search
result and break-even figure — renders identically to v1.

## `site/index.html`

The Claude Design prototype (`Guide C - Streamlined.dc.html`) is implemented as
a plain static page: no framework, one ES module, delegated event handling. Two
prototype-only pieces were replaced:

* `<image-slot>` → a `<figure>` that renders `assets/amex-platinum-card.jpg`
  when present and falls back to the same dashed placeholder when it is not.
* `sc-for` / `sc-if` / `DCLogic` → template literals and a `render()` that
  redraws the active view. The map container is never re-rendered, so Leaflet
  keeps its instance across state changes.

Accessibility and robustness additions that do not change the visual design:
`aria-pressed` / `aria-current` / `aria-expanded` on the controls that toggle,
Escape to close the methodology modal, a `prefers-reduced-motion` block, focus
styling, HTML-escaping of all interpolated data (including inside Leaflet
popups), and a visible error state if the data file fails to load.
