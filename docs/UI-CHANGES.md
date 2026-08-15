# UI-side changes

## Data refresh, 15 Aug 2026

Off-cycle, run while the page was being rebuilt. Ten of the eleven source pages
changed only their fetch timestamp. The eleventh had one real change:

**Amex added Frasers House, a Luxury Collection Hotel as a Love Dining hotel
partner**, with three outlets: LUCE (international buffet, lunch and dinner daily
plus Sunday brunch), Man Fu Yuan (Cantonese) and The Lobby Lounge (afternoon tea
and bar). All three added at the standard 35% hotel rate, with economics, scores
and occasion fit taken from the per-tier figures every other `ldh` row already
uses, so they rank against the rest rather than on their own scale. 121 entries
to 124; dining venues 76 to 79.

The refresh cadence rule changed with it. `next_refresh` was pinned to exactly
`generated_at + refresh_days`, which meant refreshing early silently pushed the
next scheduled date back. It is a ceiling now: after `generated_at`, no more than
a cycle later. This pass is generated 15 Aug and still due 25 Aug.

---

## Part 4: closing the gaps against the handoff (15 Aug 2026)

A review pass over Part 3 against frames 6a to 7b. Four things the handoff asked for
were missing, and reading the page for them turned up two more.

### The value column now says what the row is worth

`value_phrase`, authored on all 29 `access` rows, replaces a derivation that had been
answering the wrong question. Fine Hotels + Resorts rendered `always on`; it is
`S$800 a stay`. Love Dining rendered `26 places`, because the child-count branch was
tested before the discount branch, so the headline that you get half the bill lost to
a count of where. See `docs/SCHEMA-v2.md` for the field and its three rules.

**Venues now show their rate, not a year of visiting them.** The value column read
`S$2,256` against The Cliff, which is ten dinners at the minimum spend, not anything
one visit gives you. Frames 7a and 7b both show a percentage, and a rate is the only
figure comparable down a column of restaurants.

### The desktop asymmetry reaches every view

Results, Places and Your year were centring at 1080px while Home had the 340px ruled
column. They now share it: `.split` with `.split__l` and `.split__r`, each column
owning its own inset so a rule starts and stops on the same line as the text it
belongs to. `#year-body` is `display:contents` so the JS-rendered view can sit in the
same grid without a wrapper the phone would have to undo.

### Section rules draw themselves in

`.anim-rule` and the `draw` keyframe existed but were applied to nothing, and there
was no observer. The opening rule is now painted as a background stripe behind a
`2px solid transparent` border: a border cannot be animated from the left, and keeping
it in the box model means the reveal costs no layout shift. One `IntersectionObserver`
for the page, unobserving each rule after it fires, and none of it constructed at all
under `prefers-reduced-motion`.

### The map joins the palette

A filter on `.leaflet-tile` only, so markers, popups and attribution keep their own
colours. Dark mode does **not** invert: `setMapTiles()` already requests CARTO's dark
tiles, so inverting them produced a light map inside a dark page.

### Two things the review turned up

* **Every map pin was the old theme's blue.** `updateMarkers()` read
  `--cat-dining` and `--cat-lifestyle`, tokens the editorial palette does not define.
  `getPropertyValue` returns an empty string for a missing custom property rather than
  throwing, so the lookup fell through to a hardcoded `#2a78d6` and nothing anywhere
  reported a problem. The dead `CAT_VAR`, `TYPE_VAR` and `vr` exports are gone and the
  pins read `--accent` and `--page`, both of which flip with the theme.
* **Desktop could not reach 33 of the 42 benefits.** The ledger capped at three a group
  and hid the expander when `wide`, so the full ledger had no route on a large screen.
  Three a group is still what it opens with, per 6d; the expander stays reachable.

### Now covered by the page test

The authored phrase on three named rows, the expanded ledger listing all 42, venue rows
carrying a rate rather than a total, a real two-column grid with a ruled edge on all
three extended views, and pins matching the accent token. The phone context also stopped
failing the run on a third-party CDN blip: it now filters the same hosts the desktop
context already did, while still failing on a same-origin miss.

---

## Part 3: the editorial redesign (15 Aug 2026)

Handoff **AMEXSG-EDIT-20260815** from Claude Design, canvas `Home Directions.dc.html`,
approved frames 6a, 6b, 6c, 6d, 7a, 7b. The information architecture and the data
layer are unchanged. The visual language, one view boundary and three features are not.

### The language

Editorial press: cream paper, ink text, engraved rules. **Nothing sits in a card.**
Structure comes from horizontal rules, and the vocabulary is fixed: 2px ink opens a
section, 1px ink closes one, `.25` frames a soft block, `.15` separates rows, dotted
`.35` divides terms, dotted `.45` marks an editable value, a 2px underline marks an
active filter, 3px marks the active tab. No pills, no badges, no icons, no radius, no
shadows. Filters are underlined text; state is carried by weight, italic and colour.

Money gets the cinematic treatment: Instrument Serif at 72px on the phone, 62px on the
desktop. Every other figure is Spline Sans Mono with tabular figures. Newsreader
carries headings, gists and the italic phrases.

### Break even and My year merged into Your year

Four tabs became three. The old `payback` view is gone and its argument now opens the
`year` view, which has three states: the plan you have not started, the plan part
done, and the plan overtaken. Past break even the gloss turns green, a 1px tick marks
the fee and a champagne segment runs past it. Note the bar's denominator changes with
the state, the fee while there is still a gap and the total once the total is larger.

**This was not a frontend-only change.** The string `payback` was enum-locked in
`scripts/validate.mjs`, `scripts/build-schema.mjs`, the generated
`schema/benefits-data.schema.json` and `site/benefits-data.json`, with CI checking the
schema was not stale. All four moved in one commit.

### Three new things

* **The urgent two** on Home: benefits expiring inside 90 days, and `effort:claim`
  entries with nothing logged. Both derive their copy from the data, so "Three
  benefits end soon, two this month" rewrites itself rather than going stale. The
  window is deliberately narrower than the "Ending soon" scenario, so the two counts
  do not agree and are not meant to.
* **Card since** (`pbg-card-since-v1`, ISO date): drives a day-of-card-year line and
  gives the annual caps a window to reset against. Until now `annual_cap` was a
  lifetime ceiling with no date anywhere in the log path.
* **Log anything**: the full list of 92 loggable entries with steppers, opened from
  under the plan.

### Things that bit, and are now covered

* **`.ftr p` was beating `.count`.** A type-plus-class selector outranks a bare class,
  so every footer caption rendered at 13px Newsreader instead of 9px mono. The lede
  rule is scoped to its own class now.
* **A phone tab bar would have duplicated every tab selector.** It is the same `nav`
  moved by CSS, not a second copy: duplicating it gives `.tab[data-view=…]` two
  matches, which throws under Playwright's strict mode and mints duplicate ids. The
  test asserts exactly one node per tab.
* **Count-up animation versus assertions.** The numerals animate over ~900ms, so
  reading one mid-flight returns an intermediate frame. The page test runs with
  `reducedMotion: 'reduce'` throughout and checks the motion itself separately.
* **`paybackView()` returns pre-formatted strings** that `test-parity.mjs` freezes.
  The count-up needs raw numbers, so `valueSgd` and `cumSgd` were added alongside
  rather than changing `plus` and `cum`.
* **`pbg-log-v1` kept its shape.** The page test writes it raw and `loadLog()`
  silently discards anything it cannot parse, so a shape change would have failed as
  a wrong answer rather than an error. The card-since date got its own key.
* **The no-dash rule does not reach `index.html`.** `validate.mjs` only ever reads the
  JSON, so the page test now walks the rendered chrome for em and en dashes. Entry
  `details` stays exempt, the same carve-out the validator makes for Amex's own words.

### Not done

Screenshots `shot-benefits`, `shot-browse`, `shot-eat`, `shot-hero-logged` and
`shot-payback` predate this redesign and show a page that no longer exists;
`shot-payback` documents a view that has been removed outright. They were left in
place rather than deleted. `shot-home`, `shot-scenario`, `shot-places` and `shot-year`
are current.

The desktop layouts for Results, Places and Your year were never mocked, and at this
point they were still centred rather than split. Part 4 extends the 6d pattern to them.

---

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
