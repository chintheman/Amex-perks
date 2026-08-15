# Amex Platinum Guide, Singapore: Design Handover

**Prepared 15 August 2026, for a design refinement pass.**

A live, unofficial guide to every American Express Platinum benefit in Singapore.
This document is everything a designer needs to refine it: what exists, what the
data can and cannot express, the rules that are non negotiable, and the specific
problems worth solving.

| | |
| --- | --- |
| **Live** | https://www.0xsteamboat.me/amex/ |
| **Source repo** | `chintheman/Amex-perks` |
| **Host repo** | `chintheman/0xsteamboat-me` (syncs the guide in at deploy time) |
| **Status** | Shipped and live, data verified against Amex Singapore's own pages |
| **Data generated** | 2026-08-11 |
| **Next refresh due** | 2026-08-25 (14 day cycle) |
| **Affiliation** | None. Written by a cardholder, not endorsed by American Express. |

**At a glance:** 121 data rows · 42 benefits · 79 venues · 5 views · 8 scenarios ·
S$1,744 annual fee.

> **Read this first.** The page is **already built and working**. This is a
> refinement brief, not a greenfield one. The data layer, the validator and the
> test suite are settled and should be treated as fixed inputs. What is open is
> the visual and interaction design on top of them.

---

## 1. Reader and job

### Who opens this

Two audiences, in this order of importance:

1. **Existing Platinum cardholders** who pay S$1,744 a year and suspect they are
   leaving value on the table. They know the card. They do not know what is in it.
2. **Prospective cardholders** deciding whether the fee is defensible before they
   apply.

### The job

The card's benefit documentation is scattered across at least eleven Amex pages
plus PDFs. Nobody reads it. The guide collapses all of it into one place and,
critically, does the arithmetic: **here is the shortest path to clearing the fee**.

### The design problem in one line

> **Core tension.** There is a lot of data and it is overwhelming. The whole
> design exists to keep 121 rows from landing on someone at once. Every layout
> decision should be judged on whether it reduces or increases the sense of volume.

---

## 2. Current structure

### The two axes that organise everything

The 121 rows split two ways. Both splits are explicit keys in the data, not inferred.

| Axis | Value | Count | What it means |
| --- | --- | ---: | --- |
| `kind` | `benefit` | 42 | Something the card gives you |
| `kind` | `venue` | 79 | A place where one of those benefits applies |
| `effort` | `claim` | 15 | Enrol once, then it is yours |
| `effort` | `book` | 17 | Reserve or book each time |
| `effort` | `have` | 10 | Already active, nothing to do |

Venues are **never shown at the top level**. They live behind the benefit that
pays for them, reachable by drilling into it. That is the single biggest reason
the page feels manageable, and it should survive any redesign.

### Navigation: five views

| View | In the nav | What it does |
| --- | --- | --- |
| `home` | Home | Eight scenario tiles, then all 42 benefits grouped by Claim / Book / Have |
| `results` | (no tab) | The filtered output of a scenario or a drill down. Reached from Home. |
| `places` | Places to eat | All 79 dining venues, with search, occasion filter and a Leaflet map |
| `payback` | Break even | The ordered path that clears the annual fee |
| `year` | My year | Personal tracker. What the reader ticked off, localStorage only. |

### The eight scenarios

The front door is scenarios, not filters, because most readers do not know what
they are looking for. Each one is a real filter over the same data, defined in the
JSON, not hardcoded in the page.

| Label | Blurb shown on the tile |
| --- | --- |
| **Date night** | Somewhere worth the evening, without paying full price. |
| **Impress a client** | Polished and quiet enough to talk. Not bargain hunting. |
| **Actually free** | No minimum spend. Nothing to unlock first. |
| **Enrol and forget** | Worth ten minutes once. Most people never claim these. |
| **Ending soon** | Has an expiry date attached. Use it or lose it. |
| **Feeding a crowd** | Buffets and high tea, where a group discount actually lands. |
| **Flying somewhere** | Everything that only matters once you have a trip booked. |
| **Is the fee worth it?** | The shortest path to clearing S$1,744. |

### The break even path

The number the product exists to produce. Five benefits, eleven uses, and only one
of them needs any spending at all.

| Figure | Value | Note |
| --- | ---: | --- |
| Total value collected | S$2,010 | Against a S$1,744 fee |
| Value that costs nothing extra | S$1,610 | Four of the five benefits |
| Out of pocket required | S$600 | One benefit, the wine credit |
| Benefits involved | 5 | Across 11 separate uses |

---

## 3. Screens as they stand today

Screenshots live in `docs/` in this repo, captured at 1280px wide. **The live page
is the better reference and it is public:** https://www.0xsteamboat.me/amex/

| File | Shows |
| --- | --- |
| `docs/shot-home.png` | **Home.** Sticky navy header, dark hero carrying the card art and the fee arithmetic with a progress bar, then eight scenario tiles, then the 42 benefits grouped under Claim / Book / Have. The hero copy is fully derived from the data, not written by hand. |
| `docs/shot-scenario.png` | **Results.** What a scenario returns. Ranked, with a back link to all scenarios. |
| `docs/shot-places.png` | **Places to eat.** Search, occasion chips, Leaflet map, then grouped venue cards. |
| `docs/shot-payback.png` | **Break even.** The ordered path, each step with its value and running total. |
| `docs/shot-year.png` | **My year.** The tracker. Cap aware, localStorage only, never leaves the browser. |
| `docs/shot-benefits.png` | The benefits list on Home, expanded. |
| `docs/shot-hero-logged.png` | The hero once the reader has logged uses. |

---

## 4. The design system as built

Everything below is current, not prescriptive. It is here so you can see what you
are replacing and reuse anything worth keeping. All of it lives in the `:root`
block at the top of `site/index.html`.

### Palette, light mode

| Token | Hex | Role |
| --- | --- | --- |
| `--page` | `#F2F4F8` | Page ground |
| `--card` | `#FFFFFF` | Card surface |
| `--sunk` | `#E9EDF3` | Recessed surface, chips, table heads |
| `--ink` | `#0B1220` | Primary text |
| `--sec` | `#46536B` | Secondary text |
| `--muted` | `#75808F` | Labels, counts |
| `--line` | `rgba(11,18,32,0.1)` | Hairline |
| `--linestrong` | `rgba(11,18,32,0.22)` | Control border |
| `--blue` | `#006FCF` | Amex blue, the primary accent |
| `--navy` | `#00175A` | Header |
| `--hero1` | `#000F33` | Hero ground |
| `--link` / `--linkh` | `#005EB0` / `#003C74` | Links |
| progress fill | `#4ADE80` | The fee bar |

### Semantic colours

| Token | Hex | Meaning |
| --- | --- | --- |
| `--cat-dining` | `#2a78d6` | Category: dining |
| `--cat-lifestyle` | `#eb6834` | Category: lifestyle |
| `--type-discount` | `#2a78d6` | Value type: discount |
| `--type-free` | `#1baf7a` | Value type: free |
| `--type-credit` | `#4a3aa7` | Value type: credit |
| `--type-access` | `#82878F` | Value type: access |
| `--effort-claim` | `#B45309` | Effort: claim |
| `--effort-book` | `#006FCF` | Effort: book |
| `--effort-have` | `#12833B` | Effort: have |
| `--status-good` … `--status-critical` | `#12833B`, `#B27B00`, `#C2410C`, `#C0152F` | Grade bands |

> **Dark mode exists.** Every token above has a dark counterpart and there is a
> working theme toggle in the header, persisted to localStorage. Any redesign has
> to carry both. The dark palette grounds on `#0A0E17` with cards at `#121828`,
> and it is not a naive inversion.

### Type

| Role | Face | Used for |
| --- | --- | --- |
| Sans | **Schibsted Grotesk** (Google Fonts, variable 400 to 900) | Everything structural. Headings at 800 with tight negative tracking. |
| Mono | **Spline Sans Mono** (Google Fonts, 400 to 700) | All numbers, eyebrows, uppercase labels, counts, dates. Tabular figures throughout. |

The sans and mono split is doing real work: **if it is a number, it is mono and
tabular**. That rule is worth keeping whatever the faces become.

### Layout tokens

- `--wrap: 1080px`
- `--gut: clamp(14px, 4vw, 24px)`
- Radius: 6px on controls, 10px to 14px on cards
- `--shadow: 0 1px 2px rgba(11,18,32,0.06)`
- Focus: `2px solid var(--blue)`, offset 2px

### Components in play

- **Scenario tile.** Label, blurb, result count.
- **Benefit card.** Expandable. Name, subtitle, one number in a right hand column,
  a one line summary, an effort marker, and a stepper for logging uses.
- **Venue card.** Same skeleton, plus cuisine, tier and a location.
- **Stepper.** Increments a use, respects the annual cap, feeds the year view.
- **Map card.** Leaflet with CARTO tiles, fits bounds to the current result set.
- **Method modal.** Explains the scoring model, opened from the footer.
- **Progress bar.** In the hero, fills toward the annual fee.

---

## 5. The data contract

This is the part that constrains design most. A card can only show what the data
holds, and the data is deliberately sparse: fields that do not apply are
**absent, never null**.

### What every row can carry

| Group | Fields | Notes for design |
| --- | --- | --- |
| **Identity** | `id`, `name`, `kind`, `parent`, `category`, `section`, `subcategory` | Always present. `category` is dining or lifestyle only. |
| **Copy** | `summary`, `details` | Both optional. Length is uneven: some are one line, some a paragraph. Do not design a card that requires both. |
| **Economics** | `min_spend_sgd`, `gross_value_sgd`, `discount_pct`, `set_price_sgd`, `fixed_set` | Present on the 90 scored offers. **Absent on the 29 access entitlements** such as insurance and status matches. |
| **Scores** | `scores.value`, `scores.accessibility` | 0 to 100. Same story: absent on access rows. |
| **Occasion fit** | `occasion_fit.date_night`, `.business`, `.free_treat` | Dining venues only. This powers the scenario ranking. |
| **Terms** | `annual_cap`, `advance`, `condition`, `third_party_barred`, `expires` | All optional. `expires` drives the Ending soon scenario. |
| **Venue** | `venue.group`, `.cuisine`, `.tier`, `.tier_group`, `.pax` | Venues only. |
| **Location** | `locations[]` with name, lat, lng, address | Some benefits have many, most have none. |
| **Provenance** | `source` | Every row links back to the Amex page it came from. 15 distinct source URLs. |

### Derived at load, never stored

`site/guide-core.js` computes these when the page boots. The validator imports the
same module, so the page and the data gate cannot disagree.

- `composite_score` = 60% value + 40% accessibility, one decimal
- `grade`, banded from the composite
- `annual_value_sgd` = gross value × annual cap, rounded to cents
- `net_price_sgd`
- `summary`, first sentence of `details` when no summary is authored
- `children` and `childCount` on every parent

> **Hard constraint. Do not invent fields.** If a redesign wants a rating, a photo,
> an opening time or a price band that is not in the table above, it does not exist
> and cannot be faked. Adding a real field means changing the taxonomy, the schema
> and the refresh process, which is a separate piece of work.

**Amended 15 Aug 2026.** One field was added under exactly that bar:
`value_phrase`, on the 29 `access` rows. It is not new external data, it is
editorial copy over what those rows already say, written so the value column
reads `S$800 a stay` rather than a derived `always on`. It cost the schema, the
validator and a step in the refresh checklist, which is the price this rule
exists to make visible. The rule still holds for anything the repo cannot
already source.

### The value type split

| Type | Rows | Shape |
| --- | ---: | --- |
| `discount` | 84 | A percentage off, mostly dining venues |
| `access` | 29 | An entitlement with no number attached. Insurance, status, lounges. |
| `free` | 5 | Something given outright |
| `credit` | 3 | A statement credit |

That `access` column of 29 is the awkward one. Those rows have no price, no score
and no percentage, so any card design that leans on a number has to degrade
gracefully for a quarter of the dataset.

---

## 6. Copy rules

> **Absolute rule: no em dashes or en dashes anywhere.** Hyphens only where grammar
> genuinely requires them. They read as machine written. This is enforced by the
> validator, which fails the build on any dash in a name, summary, scenario label,
> blurb, taxonomy label, description, caveat or the scoring copy. The one exemption
> is a dash between two digits in a numeric range.

> **Naming rule: names describe, the number column quantifies.** No entry name
> restates a figure the card already shows. Colon tails in names are allowed only
> when they describe rather than measure. `NOX: Dine in the Dark` is fine.
> `Beast & Butterflies: 35% Off` is not.

### Voice

- Plain, direct, second person. Speaks to a cardholder, not about them.
- Never claims to be official. The footer states the guide is written by a
  cardholder and not endorsed by American Express.
- Figures are always framed as estimates, with a nudge to reconfirm with Amex or
  the venue.
- No referral links. Amex Singapore's Member Invites terms restrict referrals to
  people the referrer already knows, so the page links to the official product page
  instead.

---

## 7. Technical limits

| Constraint | Detail |
| --- | --- |
| **Static only** | One HTML file, one ES module, one JSON file, one image. No framework, no bundler, no build step. Copy the directory to any static host and it runs. |
| **External deps** | Google Fonts (two families) and Leaflet 1.9.4 from cdnjs. Map tiles from CARTO and OpenStreetMap. Nothing else. |
| **No backend** | The year tracker is localStorage. Nothing is ever sent anywhere, and the page says so. |
| **Served at a subpath** | It lives at `/amex/`, so every asset path is relative and the trailing slash matters. |
| **Cache discipline** | Asset URLs are stamped with a content hash at deploy. Cloudflare once served a stale module beside fresh HTML and the page rendered with blank figures. Any new asset needs the same treatment. |
| **Test gate** | Three suites must pass before publish: data validation, v1 parity, and a Playwright run that drives every view in headless Chromium and fails on any console error or duplicate element id. |

### Accessibility baseline already in place

- Visible focus ring on every control, 2px, offset
- `prefers-reduced-motion` honoured, animations collapse to near zero
- `aria-current` on the active tab, labelled nav and map regions
- Both themes carry their own contrast, neither is an inversion of the other

---

## 8. Open problems worth solving

These are the known weak points, in rough order of how much they bother me.

### 1. The number column carries four different units

Every card shows one number in a right hand column, but the unit changes by benefit
type: `PER YEAR`, `NO CAP`, `PLACES`, `OFF`. Each is correct for its row and
meaningless across rows, so the column cannot be scanned or compared. The original
brief asked for *one number, and make it money*. That is still unsolved, and it is
the most interesting problem here.

### 2. Volume on Home

Below the eight scenario tiles sits every one of the 42 benefits in three effort
groups. It is correct and it is complete, and it is still a long scroll. Whether
that list should be collapsed, paged, or demoted entirely is open.

### 3. The hero does a lot at once

Card art, headline, lede, the fee sentence, a progress bar, a provenance line, and
a freshness dot. All of it earns its place individually. Together it is dense,
particularly on a phone where it pushes the scenarios below the fold.

### 4. Mobile

It is responsive and it works, but it was designed desktop first and it shows. Card
density, the toolbar on Places, and the map height are all worth another pass.
Assume a meaningful share of readers arrive on a phone from a shared link.

### 5. The access rows look empty

29 entitlements have no number, no score and no percentage. In a layout built
around a figure they read as second class, when several of them (lounge access,
travel insurance, hotel status) are among the most valuable things the card carries.

### 6. Break even is a table, not a story

The strongest argument the product has is that five benefits and S$600 of spending
return S$2,010 against a S$1,744 fee. It currently reads as a list of rows with a
running total. It could be the thing people screenshot.

### 7. The theme toggle

Currently a small icon button in the header. It works. It is also easy to miss, and
dark mode is genuinely good, so more people should find it.

---

## 9. The ask

1. **Keep the information architecture.** Scenarios as the front door, venues
   nested behind the benefit that pays for them, and effort as the grouping for the
   full list. That structure is what makes the volume survivable and it was arrived
   at deliberately.
2. **Solve the number column.** One comparable figure per row, or an honest
   admission in the design that these are different kinds of things. Either is
   better than four units in one column.
3. **Make the access rows feel first class.** A quarter of the data has no number.
   The design should have a real answer for that, not a blank space.
4. **Give break even a moment.** This is the argument. It deserves more than a table.
5. **Take mobile seriously.** Design phone first for the card and list components,
   then let desktop have the space.
6. **Both themes, no dashes.** Light and dark are both first class. And no em dashes
   or en dashes in any copy you write, the validator will reject them.

> **Not in scope.** Do not redesign the data model, do not add fields, and do not
> propose anything that needs a backend or a build step. The refresh cycle is a
> person editing one JSON file every fortnight, and that has to stay true.

---

## 10. Reference

### File map

| Path | What it holds |
| --- | --- |
| `site/index.html` | The whole UI. Markup, all CSS, and one inline ES module. About 1,050 lines. |
| `site/guide-core.js` | Pure helpers plus `hydrate()`. The data to view adaptation layer, importable by Node. |
| `site/benefits-data.json` | The data. 140KB, the only file edited on a refresh. |
| `site/assets/` | The card photograph. |
| `schema/benefits-data.schema.json` | JSON Schema 2020-12, generated from the taxonomy so enums cannot drift. |
| `scripts/taxonomy.mjs` | Single source of truth for sections, tiers, occasions, efforts, grade bands. |
| `scripts/validate.mjs` | The pre publish gate, including the dash rule. |
| `scripts/test-page.mjs` | Drives the real page in headless Chromium. |
| `scripts/fetch-sources.mjs` | Renders all Amex Singapore pages to `data/sources/` for verification. |
| `docs/SCHEMA-v2.md` | The schema and the reasoning behind its shape. |
| `docs/REFRESH.md` | The fortnightly checklist. |
| `docs/UI-CHANGES.md` | What changed on the page side, including bugs that bit and are now tested. |

### Running it

| Command | What it does |
| --- | --- |
| `npm run serve` | Serves the site at localhost:8811 |
| `npm run validate` | The publish gate: enums legal, refs resolve, no nulls, ids sorted and unique, coordinates inside Singapore, schema in sync, no dashes |
| `npm run test:parity` | Proves the v1 to v2 migration lost nothing |
| `npm run test:page` | Playwright over every view, fails on console errors and duplicate ids |
| `npm run sources` | Re renders the Amex source pages for the next refresh |

### Primary sources the data is checked against

- [Platinum benefits hub](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/)
- [Travel](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/travel/)
- [Dining](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/dining/)
- [Access](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/access/)
- [Insurance and Protection](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/insurance-and-protection/)
- [Membership Rewards](https://www.americanexpress.com/en-sg/benefits/the-platinum-card/rewards-and-offers/)
- [Love Dining, restaurants](https://www.americanexpress.com/sg/benefits/love-dining/love-restaurants.html)
- [Love Dining, hotels](https://www.americanexpress.com/sg/benefits/love-dining/love-dining-hotels.html)
- Plus the Plat Stay and Member Invites PDFs, and the seasonal promotions pages

---

*Unofficial guide. Not affiliated with or endorsed by American Express. Figures are
estimates and should be reconfirmed with Amex or the venue. Map tiles ©
OpenStreetMap contributors, © CARTO.*
