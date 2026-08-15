# Pricing research, 15 August 2026

Every monetary figure in `site/benefits-data.json` re-derived from real prices
rather than the per-tier bill assumption the file was built on.

**Method agreed with Chin:** all 95 valued rows. Venue's own published price
first, a reputable third party (Chope, Burpple, hotel PDFs, dated reviews)
where the venue publishes nothing. Where a real price gives a range, publish
the **realistic typical**, not the floor and not the best case.

**Prices are recorded as the menu figure, before the ++.** Service charge and
GST add about 19.9% on top in Singapore, and a complimentary or discounted meal
usually still attracts them, so the menu figure is what the reader actually
saves. Recording nett prices would inflate every row by a fifth.

**No new schema field.** Chin chose to improve the numbers quietly, so this
file is the audit trail rather than a `source` per figure.

## What the numbers were before

`gross_value = assumed bill for the tier x discount %`, with the bill a
constant per tier and nothing per venue:

| tier | assumed for 2 | per head |
| --- | ---: | ---: |
| ultra | 300 | 150 |
| fine | 240 | 120 |
| buffet_premium | 196 | 98 |
| buffet | 176 | 88 |
| upscale | 180 | 90 |
| mid | 130 | 65 |
| casual | 110 | 55 |
| high_tea | 120 | 60 |
| cafe / bar | 90 | 45 |

---

## Findings

### Table for Two: Platinum Edition

Was S$120 for two, an assumption. Amex publishes no value and rotates three
categories: chic restaurants, buffets, cafes.

| Venue | Real price | Source |
| --- | --- | --- |
| Osteria Mozza | S$88++/head pasta tasting, S$78++/head family style dinner | osteriamozza.com.sg |
| Colony, Ritz-Carlton | S$78++/head weekday lunch buffet, S$82++ Saturday | colony.com.sg, eatbook |

Set menus and hotel buffets at this level run S$78 to S$88 a head, so a
complimentary experience for two is worth roughly **S$170**, not S$120.

### Every figure the page shows as money

The redesign changed what is at stake here. Of 124 rows, **13 display a dollar
figure**; the other 82 venues display a percentage, which is Amex's own
published rate and not an estimate at all. Three of the 13 are Amex figures
(the wine, dining and airline credits). So ten estimates are on screen, and
those are what this pass re-derived.

| Row | Was | Now | Basis |
| --- | ---: | ---: | --- |
| Sheraton Towers weddings | 1,500 | 2,040 | S$204++ a guest Saturday dinner, 20 tables of ten = S$40,800, at 5% |
| Table for Two (6 uses) | 720 | 1,020 | Osteria Mozza S$88++/head tasting, S$78++ family style; Colony S$78++ weekday lunch buffet |
| Regional golf (6 uses) | 540 | 900 | Green fees from S$150 a player weekday at the listed clubs, Sentosa far above; half of a S$300 pair |
| FHR credit (2 stays) | 290 | 450 | Breakfast for two about S$90, plus the US$100 property credit, about S$135 |
| Free hotel night | 400 | 450 | Pan Pacific Orchard deluxe S$254 to S$424 by date; St. Regis and The Fullerton above it |
| Winnie the Pooh high tea | 24 | 31 | SKAI prices it at S$78++ a head, so S$156 for two, at 20% |
| A Summer to Savour | 48 | 96 | Our own details already said the tea for two is worth ~S$96++ |
| Beast & Butterflies | 63 | 42 | **Downward.** Mains S$26 to S$38, noodles S$16 to S$18: a real dinner for two is near S$120, not the S$180 the upscale tier assumed |

Amex-stated and unchanged: Platinum Wine Credit S$400, Global Dining Credit
S$200, Airline Credit S$200.

### Two errors, not estimates

**A Summer to Savour was in "Actually free".** That scenario is
`max_min_spend: 0` and its blurb reads "No minimum spend. Nothing to unlock
first." The tea needs S$180++ of spending, and the row's own `condition` field
said so, but `min_spend_sgd` was 0 so the filter never saw it. The validator now
fails any row whose condition mentions a minimum spend while recording none.

**The same row was valued at half what our text claimed.** The details said
"worth ~S$96++", the file said 48. The perk is a tea for two, so 48 looks like
a per-head figure that lost its pair.

### What this did to the headline

Repricing pushed the five step path to S$2,520, and the fee was then cleared
three steps in. A "minimum path to break even" that carries two redundant steps
is not the minimum, so it was re-cut:

| | Before | After |
| --- | --- | --- |
| Steps | 5 | 3 |
| Uses | 11 | 9 |
| Total | S$2,010 | S$1,920 |
| Spending required | S$600 | **S$0** |

The total is lower and the claim is stronger: Table for Two, the free hotel
night and the two FHR stay credits clear a S$1,744 fee with no extra spending
at all. The wine and dining credits are still worth S$600 between them, they
are simply not needed to break even.

### The tier model, checked

Buffet assumptions turned out close: CLOVE from S$90++ a head, Crossroads
S$92++ Sunday to Thursday, Asian Market Cafe S$98 nett, against S$88 assumed.
Fine dining is slightly low: Lawry's prices a four course dinner at S$139++
against S$120 a head assumed. These figures drive ranking and grades rather
than anything displayed, so they were left as they are and the finding recorded
here instead.
