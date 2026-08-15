// guide-core.js — pure helpers for the Amex Platinum Guide (Singapore).
//
// This is the adaptation layer between benefits-data.json v2 (nested, no
// nulls, taxonomy carried in the file) and the flat shape the page renders.
// Nothing here touches the DOM except the clearly-marked Leaflet section at
// the bottom, so `node` can import the maths for the migration/validation
// scripts.

// ─────────────────────────────────────────────────────────── derived fields
// Stored in v1, derived here in v2. One source of truth, shared by the page
// and by scripts/validate.mjs.

// Rounded to 1 decimal, matching how the figure has always been published.
export function compositeScore(scores, weights) {
  if (!scores || scores.value == null || scores.accessibility == null) return null;
  const raw = scores.value * weights.value + scores.accessibility * weights.accessibility;
  return Math.round(raw * 10) / 10;
}

export function gradeFor(score, bands) {
  if (score == null) return null;
  const band = bands.find((b) => score >= b.min);
  return band ? band.grade : null;
}

export function annualValue(grossValueSgd, annualCap) {
  if (grossValueSgd == null || annualCap == null) return null;
  return Math.round(grossValueSgd * annualCap * 100) / 100; // cents, not float dust
}

// What you actually pay to unlock the benefit. A statement credit or a fixed
// set menu costs the full minimum spend; everything else nets the value off.
export function netPrice({ min_spend_sgd, gross_value_sgd }, valueType, fixedSet) {
  if (min_spend_sgd == null || gross_value_sgd == null) return null;
  if (fixedSet || valueType === 'credit') return min_spend_sgd;
  return Math.max(0, min_spend_sgd - gross_value_sgd);
}

// The one-line gist shown on collapsed rows. Derived from the first sentence
// of `details` rather than a blind character cut; entries whose one-liner is
// not simply their first sentence store an explicit `summary` instead.
export const SUMMARY_MAX = 110;

// This prose is dense with abbreviations ("requires min. S$300", "Excl.
// beverages", "≥7 days advance"), so a naive split on ". " cuts sentences in
// half. A sentence only ends when the period is not part of one of these and
// the next word starts a new sentence.
const ABBREVIATIONS = /(?:^|[\s(])(?:min|max|incl|excl|approx|est|avg|no|vs|etc|e\.g|i\.e|Dr|Mr|Mrs|Ms|St|Rd|Ave|Blvd|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.$/i;

export function firstSentence(text) {
  const end = /[.!?]+(?=\s)/g;
  let m = end.exec(text);
  while (m) {
    const head = text.slice(0, m.index + m[0].length);
    const rest = text.slice(m.index + m[0].length).trimStart();
    if (!ABBREVIATIONS.test(head) && /^[A-Z0-9(“"']/.test(rest)) return head.trim();
    m = end.exec(text);
  }
  return text.trim();
}

export function summaryOf(details, authored) {
  if (authored) return authored;
  if (!details) return null;
  const first = firstSentence(details);
  if (first.length <= SUMMARY_MAX) return first;
  const cut = details.slice(0, SUMMARY_MAX - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

// ────────────────────────────────────────────────────────────── formatting
export const fmtMoney = (n) =>
  n == null ? '—' : `S$${Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 })}`;
export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });

// CSS custom properties per taxonomy key. Presentation only — the keys
// themselves come from the data file.
export const vr = (n) => `var(${n})`;
export const CAT_VAR = { dining: '--cat-dining', lifestyle: '--cat-lifestyle' };
export const TYPE_VAR = {
  discount: '--type-discount', free: '--type-free', credit: '--type-credit', access: '--type-access',
};
export const GRADE_VAR = {
  'A+': '--status-good', A: '--status-good', 'B+': '--status-warning',
  B: '--status-warning', C: '--status-serious', D: '--status-critical',
};

// ─────────────────────────────────────────────────────────────── hydration
// v2 entries are nested and omit absent fields. `hydrate` flattens them and
// fills in everything the file no longer stores, so view code stays simple.

function flatten(e, tax, weights) {
  const v = e.venue || {};
  const m = e.economics || {};
  const t = e.terms || {};
  const composite = compositeScore(e.scores, weights);
  return {
    id: e.id,
    name: e.name,
    kind: e.kind,
    parent: e.parent || null,
    effort: e.effort,
    category: e.category,
    section: e.section,
    subcategory: e.subcategory || tax.sectionByKey[e.section]?.default_subcategory || null,
    value_type: e.value_type,
    summary: summaryOf(e.details, e.summary),
    details: e.details || null,

    venue_group: v.group || null,
    cuisine: v.cuisine || null,
    tier: v.tier || null,
    tier_group: v.tier_group || 'other',
    pax: v.pax ?? null,
    fixed_set: v.fixed_set === true,
    set_price_sgd: v.set_price_sgd ?? null,

    min_spend_sgd: m.min_spend_sgd ?? null,
    gross_value_sgd: m.gross_value_sgd ?? null,
    net_price_sgd: netPrice(m, e.value_type, v.fixed_set === true),
    discount_pct: m.discount_pct ?? null,
    min_spend_to_activate: m.min_spend_to_activate ?? null,
    annual_value_sgd: annualValue(m.gross_value_sgd ?? null, t.annual_cap ?? null),

    annual_cap: t.annual_cap ?? null,
    advance: t.advance || null,
    condition: t.condition || null,
    third_party_barred: t.third_party_barred ?? null,
    expires: t.expires || null,

    value_score: e.scores?.value ?? null,
    accessibility_score: e.scores?.accessibility ?? null,
    composite_score: composite,
    grade: gradeFor(composite, tax.grade_bands),

    occasion_fit: e.occasion_fit || {},
    locations: e.locations || [],
    source: e.source,
  };
}

export function hydrate(raw) {
  const tax = {
    ...raw.taxonomy,
    sectionByKey: Object.fromEntries(raw.taxonomy.sections.map((s) => [s.key, s])),
    tierGroupByKey: Object.fromEntries(raw.taxonomy.tier_groups.map((g) => [g.key, g])),
    valueTypeByKey: Object.fromEntries(raw.taxonomy.value_types.map((t) => [t.key, t])),
    categoryByKey: Object.fromEntries(raw.taxonomy.categories.map((c) => [c.key, c])),
  };
  const weights = raw.scoring.weights;
  const entries = raw.entries.map((e) => {
    const f = flatten(e, tax, weights);
    f.gist = gist(f);
    // v1 searched name + venue_group + cuisine + subcategory; unchanged.
    f.search = [f.name, f.venue_group, f.cuisine, f.subcategory].filter(Boolean).join(' ').toLowerCase();
    return f;
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  // Each parent carries its venues, so a benefit card can say "26 restaurants,
  // up to 50% off" without the page counting anything itself.
  const children = new Map();
  for (const e of entries) {
    if (!e.parent) continue;
    if (!children.has(e.parent)) children.set(e.parent, []);
    children.get(e.parent).push(e);
  }
  for (const e of entries) {
    e.children = children.get(e.id) || [];
    e.childCount = e.children.length;
  }
  return { ...raw, tax, entries, byId, benefits: entries.filter((e) => e.kind === 'benefit'), venues: entries.filter((e) => e.kind === 'venue') };
}

export async function loadData(url = './benefits-data.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`benefits-data.json: HTTP ${res.status}`);
  const raw = await res.json();
  if (raw.schema_version !== 2) throw new Error(`unsupported schema_version ${raw.schema_version}`);
  return hydrate(raw);
}

// ─────────────────────────────────────────────────────────────── scenarios
// A scenario is a saved filter plus a sentence. Every predicate here maps to
// one key in `scenarios[].filter`; the validator rejects any other key, and
// rejects a filter that matches nothing.
const PREDICATES = {
  kind: (e, v) => e.kind === v,
  effort: (e, v) => e.effort === v,
  section: (e, v) => e.section === v,
  sections: (e, v) => v.includes(e.section),
  value_type: (e, v) => e.value_type === v,
  value_types: (e, v) => v.includes(e.value_type),
  tier_groups: (e, v) => v.includes(e.tier_group),
  subcategories: (e, v) => v.includes(e.subcategory),
  has_expiry: (e, v) => (v ? !!e.expires : !e.expires),
  occasion: (e, v) => e.occasion_fit[v] != null,
  min_occasion_fit: (e, v, f) => e.occasion_fit[f.occasion] >= v,
  max_min_spend: (e, v) => e.min_spend_sgd != null && e.min_spend_sgd <= v,
};

// Missing values sort last rather than throwing off the comparison.
const nz = (v) => (v == null ? -1 : v);

const SCENARIO_SORTS = {
  occasion_desc: (f) => (a, b) => nz(b.occasion_fit[f.occasion]) - nz(a.occasion_fit[f.occasion]),
  value_desc: () => (a, b) => nz(b.annual_value_sgd) - nz(a.annual_value_sgd),
  expiry_asc: () => (a, b) => String(a.expires || '9999').localeCompare(String(b.expires || '9999')),
  name_asc: () => (a, b) => a.name.localeCompare(b.name),
  composite_desc: () => (a, b) => nz(b.composite_score) - nz(a.composite_score),
};

export function runScenario(data, scenario) {
  if (!scenario?.filter) return [];
  const f = scenario.filter;
  const rows = data.entries.filter((e) =>
    Object.entries(f).every(([k, v]) => PREDICATES[k]?.(e, v, f) ?? true));
  const sorter = (SCENARIO_SORTS[scenario.sort] || SCENARIO_SORTS.composite_desc)(f);
  return rows.sort(sorter);
}

// ────────────────────────────────────────────────────────── the year's log
// What you have actually used, as {entryId: uses}. Kept deliberately dumb: the
// page owns storage, this owns the arithmetic, so both are testable alone.
//
// Anything with a gross value can be logged, benefit or venue alike, because
// the value is real either way: a S$45 saving at one restaurant counts exactly
// as much as S$200 of statement credit.

export const canLog = (e) => e.gross_value_sgd != null && e.gross_value_sgd > 0;

/** Uses left before the entry hits its annual cap. Infinity when uncapped. */
export function usesLeft(entry, log) {
  if (!canLog(entry)) return 0;
  const used = log[entry.id] || 0;
  return entry.annual_cap == null ? Infinity : Math.max(0, entry.annual_cap - used);
}

export function logUse(log, entry, delta = 1) {
  const used = log[entry.id] || 0;
  const cap = entry.annual_cap ?? Infinity;
  const next = Math.max(0, Math.min(cap, used + delta));
  const out = { ...log };
  if (next === 0) delete out[entry.id]; else out[entry.id] = next;
  return out;
}

export function logSummary(data, log) {
  const rows = Object.entries(log)
    .map(([id, uses]) => {
      const entry = data.byId.get(id);
      if (!entry || !uses) return null;
      return { entry, uses, value: (entry.gross_value_sgd || 0) * uses };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const fee = data.card.annual_fee_sgd;
  // Deliberately a count, not a total. Summing every remaining use gives about
  // S$54,000, which assumes maxing the cap on all 92 entries including twelve
  // visits to every buffet. True, useless, and it would make every other figure
  // on the page look invented.
  const loggableCount = data.entries.filter(canLog).length;

  return {
    rows,
    totalSgd: total,
    fee,
    pct: Math.min(100, (total / fee) * 100),
    cleared: total >= fee,
    shortfall: Math.max(0, fee - total),
    surplus: Math.max(0, total - fee),
    uses: rows.reduce((n, r) => n + r.uses, 0),
    benefitCount: rows.length,
    loggableCount,
  };
}

// ──────────────────────────────────────────────────────────── the card year
// The log is a lifetime counter keyed by entry id. Caps are annual, so they
// need a window to reset against, and the only honest window is the card's own
// anniversary rather than the calendar year: the fee is charged on the
// anniversary, so that is when the year that has to pay for it starts.

/** Days between two dates, ignoring clock time and DST. */
const dayDiff = (a, b) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
    - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

// Local calendar date, not `toISOString()`. These dates are constructed at
// local midnight, and Singapore is UTC+8, so toISOString() rolls them back to
// the previous day — the card-since date would render one day early.
const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Where today sits in the card year that began on the last anniversary of
 * `sinceISO`. Returns null for a missing or unparseable date, so the caller
 * can simply not render the line rather than printing "Day NaN".
 */
export function cardYear(sinceISO, today = new Date()) {
  if (!sinceISO) return null;
  const since = new Date(`${String(sinceISO).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(since.getTime())) return null;
  if (dayDiff(since, today) < 0) return null; // a start date in the future

  let start = new Date(since);
  start.setFullYear(today.getFullYear());
  if (dayDiff(start, today) < 0) start.setFullYear(today.getFullYear() - 1);
  const end = new Date(start);
  end.setFullYear(start.getFullYear() + 1);

  // The year runs day 1 (the anniversary) to day `length`. Counting days left
  // as the gap to the next anniversary double-counts that boundary, so it is
  // the remainder of the year's own length instead: 277 + 88 = 365, not 366.
  const length = dayDiff(start, end);
  const day = dayDiff(start, today) + 1;
  return {
    start,
    end,
    startISO: isoLocal(start),
    endISO: isoLocal(end),
    length,
    day,
    daysLeft: length - day,
  };
}

// ───────────────────────────────────────────────────────────── the urgent two
// Two things on Home that are time-sensitive rather than merely available: what
// is about to expire, and what is sitting unclaimed. Both are derived, never
// written down, so the copy cannot go stale against the data.

export const EXPIRY_WINDOW_DAYS = 90;

/** Entries whose `expires` falls inside the window, soonest first. */
export function expiringSoon(data, today = new Date(), days = EXPIRY_WINDOW_DAYS) {
  return data.entries
    .filter((e) => e.expires)
    .map((e) => ({ entry: e, days: dayDiff(today, new Date(`${e.expires}T00:00:00`)) }))
    .filter((r) => r.days >= 0 && r.days <= days)
    .sort((a, b) => a.days - b.days);
}

/** Claim-effort benefits with nothing logged against them yet. */
export function unclaimed(data, log = {}) {
  return data.benefits.filter((e) => e.effort === 'claim' && !log[e.id]);
}

// Small counts read better spelled out than as digits, and the sentence has to
// survive any count, so the words run out gracefully into numerals.
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen',
  'Nineteen', 'Twenty'];
export function numWord(n, { lower = false } = {}) {
  const w = WORDS[n] ?? String(n);
  return lower ? w.toLowerCase() : w;
}

/**
 * The two urgent rows, copy included. Returns null for a row with nothing in
 * it so Home can drop it rather than print "No benefits end soon", which is
 * true but not worth a row.
 */
export function urgentTwo(data, log = {}, today = new Date()) {
  const soon = expiringSoon(data, today);
  const month = String(today.getFullYear()) + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const thisMonth = soon.filter((r) => r.entry.expires.startsWith(month)).length;
  const open = unclaimed(data, log);

  return {
    expiring: soon.length ? {
      count: soon.length,
      thisMonth,
      nearest: soon[0].entry.expires,
      rows: soon,
      copy: `${numWord(soon.length)} benefit${soon.length === 1 ? '' : 's'} end soon`
        + (thisMonth ? `, ${numWord(thisMonth, { lower: true })} this month` : ''),
      hint: fmtDate(soon[0].entry.expires).replace(/ \d{4}$/, ''),
      scenario: 'ending-soon',
    } : null,
    unclaimed: open.length ? {
      count: open.length,
      copy: `${numWord(open.length)} enrolment${open.length === 1 ? '' : 's'} `
        + `${open.length === 1 ? 'is' : 'are'} not yet switched on`,
      hint: '10 min',
      scenario: 'enrol',
    } : null,
  };
}

// ──────────────────────────────────────────────────── the plan, against the log
// The merged Your year view needs the break-even path and the log read
// together: which steps are done, which are part-way, and what is still owed.
// Steps are walked in order and draw down the entry's logged uses, so two steps
// referencing the same benefit cannot both claim the same use.

export function planProgress(data, log = {}) {
  const remaining = { ...log };
  return data.payback_path.steps.map((step, i) => {
    const entry = data.byId.get(step.ref);
    if (!entry) return null;
    const required = step.uses || 1;
    const available = remaining[step.ref] || 0;
    const used = Math.min(available, required);
    remaining[step.ref] = available - used;
    const unit = entry.gross_value_sgd ?? 0;
    return {
      i,
      id: step.ref,
      entry,
      name: entry.name,
      required,
      used,
      state: used >= required ? 'done' : used > 0 ? 'partial' : 'open',
      valueSgd: unit * required,
      loggedSgd: unit * used,
      condition: step.condition || entry.condition || entry.summary || '',
    };
  }).filter(Boolean);
}

// One-line gist for a collapsed row. v2 stores a real `summary`, so this no
// longer truncates prose mid-sentence.
export function gist(e) {
  const bits = [];
  if (e.cuisine) bits.push(e.cuisine);
  if (e.venue_group) bits.push(e.venue_group);
  if (!bits.length && e.subcategory) bits.push(e.subcategory);
  if (e.summary) bits.push(e.summary.replace(/\.+$/, ''));
  return bits.join(' · ');
}

// ───────────────────────────────────────────────────────────── payback path
// v2 stores ordered references (`ref`, `uses`, `split`). Every figure below is
// computed from the referenced entry, so the path can no longer drift from
// `entries` on a refresh.
export function paybackView(data) {
  const fee = data.card.annual_fee_sgd;
  const steps = [];
  for (const step of data.payback_path.steps) {
    const e = data.byId.get(step.ref);
    if (!e) continue; // validate.mjs fails the build on a dangling ref
    const uses = step.uses || 1;
    const unit = e.gross_value_sgd ?? 0;
    const condition = step.condition || e.condition || e.summary || '';
    if (step.split) {
      for (let i = 1; i <= uses; i += 1) {
        steps.push({ entry: e, name: `${e.name} (use ${i} of ${uses})`, value: unit, condition });
      }
    } else {
      steps.push({ entry: e, name: e.name, value: unit * uses, condition });
    }
  }
  let cum = 0;
  let cleared = false;
  const rows = steps.map((s, i) => {
    cum += s.value;
    const clearsHere = !cleared && cum >= fee;
    if (clearsHere) cleared = true;
    return {
      id: s.entry.id,
      num: String(i + 1),
      name: s.name,
      condition: s.condition,
      plus: `+${fmtMoney(s.value)}`,
      cum: `cum. ${fmtMoney(cum)}`,
      clearsHere,
      // Numeric twins of `plus` and `cum`. The strings above are asserted
      // verbatim by scripts/test-parity.mjs, so they cannot become numbers —
      // but a count-up animation needs the raw figure, so it gets its own key.
      valueSgd: s.value,
      cumSgd: cum,
    };
  });
  const surplus = cum - fee;
  // Distinct benefits, not rows. Table for Two used three times is one benefit
  // used three times; counting rows made the page claim eight benefits when
  // the path only ever draws on six.
  const benefitCount = new Set(data.payback_path.steps.map((s) => s.ref)).size;
  const useCount = data.payback_path.steps.reduce((n, s) => n + (s.uses || 1), 0);
  // Which of them cost you something to collect, so the sentence can name them
  // rather than hard-coding a number that goes stale when the path is re-cut.
  const paidSteps = data.payback_path.steps.filter((s) => (data.byId.get(s.ref)?.min_spend_sgd || 0) > 0);
  // What you must spend to collect it. Some steps are statement credits that
  // only pay out against a qualifying transaction, so the headline figure is
  // not free money and should never be presented as if it were.
  const outlay = data.payback_path.steps.reduce((sum, s) => {
    const e = data.byId.get(s.ref);
    return sum + (e?.min_spend_sgd || 0) * (s.uses || 1);
  }, 0);
  return {
    steps: rows,
    total: fmtMoney(cum),
    totalSgd: cum,
    benefitCount,
    useCount,
    paidCount: paidSteps.length,
    outlaySgd: outlay,
    freeValueSgd: data.payback_path.steps.reduce((sum, s) => {
      const e = data.byId.get(s.ref);
      return e && !e.min_spend_sgd ? sum + (e.gross_value_sgd || 0) * (s.uses || 1) : sum;
    }, 0),
    fee: fmtMoney(fee),
    clearedFee: cum >= fee,
    surplusText: surplus > 0 ? ` with S$${surplus.toFixed(0)} to spare` : '',
    pct: Math.min(100, (cum / fee) * 100),
  };
}

// ──────────────────────────────────────────── Leaflet helpers (browser only)
// No-throw if Leaflet or its tiles are unavailable — the page still works.
export function createMap(el, dark) {
  if (typeof L === 'undefined' || !el) return null;
  try {
    const map = L.map(el, { scrollWheelZoom: false }).setView([1.3157, 103.85], 12);
    setMapTiles(map, dark);
    return map;
  } catch (err) {
    console.warn('Map unavailable:', err);
    return null;
  }
}

export function setMapTiles(map, dark) {
  if (!map) return;
  if (map._pbgTiles) map.removeLayer(map._pbgTiles);
  map._pbgTiles = L.tileLayer(
    dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 18, attribution: '© OpenStreetMap contributors © CARTO' },
  ).addTo(map);
}

export function updateMarkers(map, rows, markers) {
  if (!map) return { markers: [], count: 0 };
  markers.forEach((m) => map.removeLayer(m));
  const out = [];
  const bounds = [];
  const css = getComputedStyle(document.documentElement);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  rows.forEach((e) => {
    e.locations.forEach((loc) => {
      const color = css.getPropertyValue(CAT_VAR[e.category]).trim() || '#2a78d6';
      const m = L.circleMarker([loc.lat, loc.lng], {
        radius: 7, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.9,
      }).addTo(map);
      m.bindPopup(
        `<b>${esc(e.name)}</b><br>${loc.name !== e.name ? `${esc(loc.name)}<br>` : ''}` +
        `${esc(loc.address || '')}${e.grade ? `<br>Grade: ${esc(e.grade)}` : ''}`,
      );
      out.push(m);
      bounds.push([loc.lat, loc.lng]);
    });
  });
  // `animate: false` matters: an in-flight zoom animation keeps firing frames
  // after the view changes and the map is destroyed, and Leaflet throws
  // reading `_leaflet_pos` off the pane it no longer has.
  if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14, animate: false });
  return { markers: out, count: out.length };
}
