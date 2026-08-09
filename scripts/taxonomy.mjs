// Canonical taxonomy for benefits-data v2.
// This is the single source of truth used by the migration, the validator and
// the JSON Schema generator. The same block is emitted into benefits-data.json
// under `taxonomy`, so the page never hard-codes a label or a bucket rule.

export const CATEGORIES = [
  { key: 'dining', label: 'Dining' },
  { key: 'lifestyle', label: 'Lifestyle' },
];

export const VALUE_TYPES = [
  { key: 'discount', label: 'Discount' },
  { key: 'free', label: 'Free' },
  { key: 'credit', label: 'Credit' },
  { key: 'access', label: 'Access' },
];

// `default_subcategory` is the label every entry in that section carries
// unless it overrides it — that is why most entries no longer store one.
export const SECTIONS = [
  { key: 'ldr',   label: 'Love Dining · Restaurants', chip: 'Restaurants',        desc: 'Year-round 50% off food for two at standalone restaurants', default_subcategory: 'Love Dining · Restaurant' },
  { key: 'ldh',   label: 'Love Dining · Hotels',      chip: 'Hotel dining',       desc: 'Up to 50% off at hotel restaurants and bars', default_subcategory: 'Love Dining · Hotel Outlet' },
  { key: 'promo', label: 'Dining Promotions',         chip: 'Promotions',         desc: 'Limited-time offers — check validity dates', default_subcategory: 'Dining Promotions' },
  { key: 'progs', label: 'Seasonal, Credits & Programs', chip: 'Credits & programs', desc: 'Statement credits, seasonal offers, special programs' },
  { key: 'life',  label: 'Lifestyle & Travel',        chip: 'Lifestyle & travel', desc: 'Hotels, lounges, spa, golf, shopping, insurance' },
];

export const TIER_GROUPS = [
  { key: 'fine',    label: 'Fine dining',          desc: 'Tasting menus & top-tier tables' },
  { key: 'upscale', label: 'Upscale restaurants',  desc: 'Polished dining & hotel flagships' },
  { key: 'casual',  label: 'Casual & everyday',    desc: 'Mid-range spots & cafés' },
  { key: 'buffet',  label: 'Buffets',              desc: 'Hotel spreads, incl. premium lines' },
  { key: 'hightea', label: 'High tea',             desc: 'Afternoon tea sets' },
  { key: 'bar',     label: 'Bars & drinks',        desc: 'Cocktail bars & bar bites' },
  { key: 'other',   label: 'Credits & extras',     desc: 'Dining credits and everything else' },
];

// tier -> { label, group }. `group` is what the Eat view buckets by; it is also
// written onto every entry as `venue.tier_group` so a new tier can never fall
// silently into "other" without the validator noticing.
export const TIERS = {
  ultra:          { label: 'Top-tier splurge', group: 'fine' },
  fine:           { label: 'Fine dining',      group: 'fine' },
  upscale:        { label: 'Upscale',          group: 'upscale' },
  mid:            { label: 'Mid-range',        group: 'casual' },
  casual:         { label: 'Casual',           group: 'casual' },
  cafe:           { label: 'Café',             group: 'casual' },
  buffet:         { label: 'Buffet',           group: 'buffet' },
  buffet_premium: { label: 'Premium buffet',   group: 'buffet' },
  high_tea:       { label: 'Afternoon tea',    group: 'hightea' },
  bar:            { label: 'Bar',              group: 'bar' },
  credit:         { label: 'Credit',           group: 'other' },
};

export const OCCASIONS = [
  { key: 'date_night', label: 'Date Night',      desc: 'Romantic, 2-for-1 sweet spot — best discounts almost everywhere are for pairs.' },
  { key: 'business',   label: 'Business Dinner', desc: 'Polished, quiet fine-dining suited to entertaining a client — not bargain-hunting.' },
  { key: 'free_treat', label: 'Free Treat',      desc: 'Zero minimum spend — a genuinely complimentary dining experience or credit.' },
];

// Ordered high -> low. `min` is inclusive; the last band is the floor.
export const GRADE_BANDS = [
  { grade: 'A+', min: 90 },
  { grade: 'A',  min: 80 },
  { grade: 'B+', min: 70 },
  { grade: 'B',  min: 60 },
  { grade: 'C',  min: 45 },
  { grade: 'D',  min: 0 },
];

export const SCORING = { weights: { value: 0.6, accessibility: 0.4 } };

// v1 `subcategory` free text -> v2 `section` key. Migration-only: v2 entries
// carry `section` explicitly, so this map never runs at page load.
export const V1_SUBCATEGORY_TO_SECTION = {
  'Love Dining · Restaurant': 'ldr',
  'Love Dining · Hotel Outlet': 'ldh',
  'Dining Promotions': 'promo',
};

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const TIER_GROUP_KEYS = TIER_GROUPS.map((g) => g.key);
export const VALUE_TYPE_KEYS = VALUE_TYPES.map((t) => t.key);
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const OCCASION_KEYS = OCCASIONS.map((o) => o.key);
export const TIER_KEYS = Object.keys(TIERS);
export const GRADE_KEYS = GRADE_BANDS.map((b) => b.grade);
