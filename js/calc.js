// ============================================================
// calc.js — pure cost-calculation logic. No DOM, no storage.
// Money is computed in euros and rounded to cents per displayed
// component, so every visible row adds up to the visible total.
// ============================================================

// Unit definitions: factor converts the unit to its family base
// (grams for mass, millilitres for volume, pieces for count).
export const UNITS = {
  g:   { factor: 1,    family: 'mass' },
  kg:  { factor: 1000, family: 'mass' },
  ml:  { factor: 1,    family: 'vol' },
  l:   { factor: 1000, family: 'vol' },
  pcs: { factor: 1,    family: 'count' },
};

export const UNIT_ORDER = ['g', 'kg', 'ml', 'l', 'pcs'];

// Units that can be used in a recipe for an ingredient priced in `packUnit`.
export function compatibleUnits(packUnit) {
  const fam = UNITS[packUnit]?.family;
  return UNIT_ORDER.filter((u) => UNITS[u].family === fam);
}

export function roundCents(value) {
  if (!isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

// Non-negative number or 0. Used for user-entered money/time/percent.
function atLeastZero(value) {
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : 0;
}

// Price per base unit (per gram / per ml / per piece). null if not computable.
export function unitPrice(ingredient) {
  const u = UNITS[ingredient.packUnit];
  if (!u) return null;
  const qty = Number(ingredient.packQty);
  const price = Number(ingredient.packPrice);
  if (!isFinite(qty) || qty <= 0 || !isFinite(price) || price < 0) return null;
  return price / (qty * u.factor);
}

// Cost of one recipe line at base (multiplier 1).
// Returns { cost, warning } where warning is null | 'missing' | 'mismatch' | 'price'.
export function itemCost(item, ingredientsById) {
  // A freshly added row has no ingredient yet — that is not an error.
  if (!item.ingredientId) return { cost: 0, warning: null };
  const ing = ingredientsById[item.ingredientId];
  if (!ing) return { cost: 0, warning: 'missing' };
  const iu = UNITS[item.unit];
  const pu = UNITS[ing.packUnit];
  if (!iu || !pu) return { cost: 0, warning: 'mismatch' };
  if (iu.family !== pu.family) return { cost: 0, warning: 'mismatch' };
  const per = unitPrice(ing);
  if (per === null) return { cost: 0, warning: 'price' };
  const qty = Number(item.qty);
  if (!isFinite(qty) || qty < 0) return { cost: 0, warning: null };
  return { cost: qty * iu.factor * per, warning: null };
}

// Approximate weight of the recipe in grams at multiplier 1.
// Mass counts exactly; volume approximated 1 ml ≈ 1 g; pieces count only
// when the ingredient declares gramsPerPiece (e.g. one egg ≈ 55 g).
export function recipeBaseWeight(recipe, ingredientsById) {
  let grams = 0;
  for (const item of recipe.items || []) {
    const u = UNITS[item.unit];
    const qty = Number(item.qty);
    if (!u || !isFinite(qty) || qty <= 0) continue;
    if (u.family === 'mass' || u.family === 'vol') {
      grams += qty * u.factor;
    } else if (u.family === 'count') {
      const per = Number(ingredientsById?.[item.ingredientId]?.gramsPerPiece);
      if (isFinite(per) && per > 0) grams += qty * per;
    }
  }
  return grams;
}

// True when the recipe has piece-counted items whose weight is unknown,
// so the weight figures are understated and the UI should say so.
export function hasUnweighedPieces(recipe, ingredientsById) {
  return (recipe.items || []).some((item) => {
    if (UNITS[item.unit]?.family !== 'count') return false;
    const qty = Number(item.qty);
    if (!isFinite(qty) || qty <= 0) return false;
    const per = Number(ingredientsById?.[item.ingredientId]?.gramsPerPiece);
    return !(isFinite(per) && per > 0);
  });
}

// Full cost breakdown for a recipe.
// settings: { laborRate, marginPct }
// Every money figure is already rounded to cents and internally consistent:
// rawCost is the sum of the rounded per-item costs, fullCost the sum of the
// rounded components, so the displayed rows always add up.
export function recipeCosts(recipe, ingredientsById, settings) {
  const warnings = [];
  const baseItemCosts = (recipe.items || []).map((item, index) => {
    const r = itemCost(item, ingredientsById);
    if (r.warning) warnings.push({ index, warning: r.warning });
    return r.cost;
  });

  const baseCost = roundCents(baseItemCosts.reduce((a, b) => a + roundCents(b), 0));
  const baseWeight = recipeBaseWeight(recipe, ingredientsById);

  const laborRate = atLeastZero(settings?.laborRate);
  const laborMinutes = atLeastZero(recipe.laborMinutes);
  const packagingCost = roundCents(atLeastZero(recipe.packagingCost));
  const laborCost = roundCents((laborMinutes / 60) * laborRate);
  const extrasCost = roundCents(packagingCost + laborCost);

  const marginRaw =
    recipe.marginPct === null || recipe.marginPct === undefined || recipe.marginPct === ''
      ? settings?.marginPct
      : recipe.marginPct;
  const marginPct = atLeastZero(marginRaw);

  const sizeDefs =
    recipe.sizes && recipe.sizes.length
      ? recipe.sizes
      : [{ id: 'base', label: '', multiplier: 1 }];

  const sizes = sizeDefs.map((s) => {
    const k = Number(s.multiplier);
    const mult = isFinite(k) && k > 0 ? k : 1;
    // Sum of rounded scaled item costs, so the row breakdown adds up.
    const rawCost = roundCents(
      baseItemCosts.reduce((sum, c) => sum + roundCents(c * mult), 0)
    );
    // Packaging and labor are per cake, not scaled by size.
    const fullCost = roundCents(rawCost + extrasCost);
    const price = roundCents(fullCost * (1 + marginPct / 100));
    return {
      id: s.id,
      label: s.label,
      multiplier: mult,
      rawCost,
      packagingCost,
      laborCost,
      laborMinutes,
      extrasCost,
      fullCost,
      price,
      weight: baseWeight * mult,
    };
  });

  return { baseCost, baseWeight, warnings, marginPct, packagingCost, laborCost, laborMinutes, sizes };
}

// Multiplier from pan diameters (same height assumed): area ratio.
export function multiplierFromDiameter(baseD, newD) {
  const a = Number(baseD);
  const b = Number(newD);
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  return (b / a) * (b / a);
}

// Multiplier from a target total weight vs the recipe's base weight.
export function multiplierFromWeight(baseWeightG, targetWeightG) {
  const a = Number(baseWeightG);
  const b = Number(targetWeightG);
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  return b / a;
}

// Parse a user-entered number: accepts "1,5", "1.5", "30 %", "2,50 €",
// and the grouped forms the app itself prints, such as "1,000" in English.
// Returns null when the text holds no usable number, so callers can keep
// the previous value instead of silently substituting 0.
export function parseNum(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  let s = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/[%\u20ac$\u00a3]/g, '');
  if (s === '') return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal one; the other groups digits.
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
  } else if (hasComma) {
    // "1,000" / "1,234,567" is digit grouping; "1,5" is a decimal comma.
    s = /^[+-]?\d{1,3}(,\d{3})+$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
  }

  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// ---------- formatting ----------

const moneyFmtCache = {};
export function fmtMoney(value, lang) {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-IE';
  if (!moneyFmtCache[locale]) {
    moneyFmtCache[locale] = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
    });
  }
  return moneyFmtCache[locale].format(isFinite(value) ? value : 0);
}

const numFmtCache = {};
export function fmtNum(value, lang, maxDecimals = 2) {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-IE';
  const key = locale + ':' + maxDecimals;
  if (!numFmtCache[key]) {
    numFmtCache[key] = new Intl.NumberFormat(locale, {
      maximumFractionDigits: maxDecimals,
    });
  }
  return numFmtCache[key].format(isFinite(value) ? value : 0);
}

export function fmtWeight(grams, lang) {
  if (!isFinite(grams) || grams <= 0) return '';
  if (grams >= 1000) return `≈ ${fmtNum(grams / 1000, lang, 2)} ${lang === 'ru' ? 'кг' : 'kg'}`;
  return `≈ ${fmtNum(Math.round(grams), lang, 0)} ${lang === 'ru' ? 'г' : 'g'}`;
}
