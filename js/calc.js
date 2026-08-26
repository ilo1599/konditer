// ============================================================
// calc.js — pure cost-calculation logic. No DOM, no storage.
// Money is handled in floating euros and rounded only for display.
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

// Approximate base weight of the recipe in grams.
// Mass counts exactly; volume approximated 1 ml ≈ 1 g; pieces ignored.
export function recipeBaseWeight(recipe) {
  let grams = 0;
  for (const item of recipe.items || []) {
    const u = UNITS[item.unit];
    const qty = Number(item.qty);
    if (!u || !isFinite(qty) || qty <= 0) continue;
    if (u.family === 'mass' || u.family === 'vol') grams += qty * u.factor;
  }
  return grams;
}

// Full cost breakdown for a recipe.
// settings: { laborRate, marginPct }
// Returns {
//   baseCost, baseWeight, warnings: [{index, warning}],
//   sizes: [{ id, label, multiplier, rawCost, extrasCost, fullCost, price, weight }]
// }
export function recipeCosts(recipe, ingredientsById, settings) {
  let baseCost = 0;
  const warnings = [];
  (recipe.items || []).forEach((item, index) => {
    const r = itemCost(item, ingredientsById);
    baseCost += r.cost;
    if (r.warning) warnings.push({ index, warning: r.warning });
  });

  const baseWeight = recipeBaseWeight(recipe);

  const laborRate = Number(settings?.laborRate) || 0;
  const laborMinutes = Number(recipe.laborMinutes) || 0;
  const packagingCost = Number(recipe.packagingCost) || 0;
  const extrasCost = packagingCost + (laborMinutes / 60) * laborRate;

  const marginPct =
    recipe.marginPct === null || recipe.marginPct === undefined || recipe.marginPct === ''
      ? Number(settings?.marginPct) || 0
      : Number(recipe.marginPct) || 0;

  const sizeDefs =
    recipe.sizes && recipe.sizes.length
      ? recipe.sizes
      : [{ id: 'base', label: '', multiplier: 1 }];

  const sizes = sizeDefs.map((s) => {
    const k = Number(s.multiplier);
    const mult = isFinite(k) && k > 0 ? k : 1;
    const rawCost = baseCost * mult;
    // Packaging and labor are per cake, not scaled by size.
    const fullCost = rawCost + extrasCost;
    const price = fullCost * (1 + marginPct / 100);
    return {
      id: s.id,
      label: s.label,
      multiplier: mult,
      rawCost,
      extrasCost,
      fullCost,
      price,
      weight: baseWeight * mult,
    };
  });

  return { baseCost, baseWeight, warnings, marginPct, sizes };
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

// Parse a user-entered number: accepts "1,5" and "1.5"; returns null if invalid.
export function parseNum(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
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
