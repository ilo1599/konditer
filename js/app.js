// ============================================================
// app.js — views, routing, events.
// Vanilla JS, no build step. State lives in Store; the recipe
// editor works on a draft that auto-saves with a debounce.
// ============================================================

import { t, tp, getLang, setLang } from './i18n.js';
import {
  UNITS, compatibleUnits, unitPrice, itemCost, recipeCosts,
  multiplierFromDiameter, multiplierFromWeight, parseNum,
  fmtMoney, fmtNum, fmtWeight,
} from './calc.js';
import { Store } from './store.js';

const main = document.getElementById('main');
const topnav = document.getElementById('topnav');
const modeBadge = document.getElementById('mode-badge');

const EMOJIS = ['🎂', '🍰', '🧁', '🍓', '🍒', '🍫', '🥧', '🍪', '🍩', '🥐', '🍋', '🫐', '🍑', '🌰', '🍮'];
const PLATES = ['#ffe8ec', '#fff4e0', '#e8f4ea', '#edebff', '#fdefe2', '#e7f3f8', '#f6e8f4', '#f3f0e8'];

// ---------------- helpers ----------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function plateFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLATES[h % PLATES.length];
}

function numToInput(n) {
  if (n === null || n === undefined || n === '' || n === 0) return '';
  const s = String(n);
  return getLang() === 'ru' ? s.replace('.', ',') : s;
}

function unitLabel(u) {
  const ru = { g: 'г', kg: 'кг', ml: 'мл', l: 'л', pcs: 'шт' };
  const en = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', pcs: 'pcs' };
  return (getLang() === 'ru' ? ru : en)[u] || u;
}

function baseUnitLabel(u) {
  const fam = UNITS[u]?.family;
  if (fam === 'mass') return unitLabel('kg');
  if (fam === 'vol') return unitLabel('l');
  return unitLabel('pcs');
}

// price per kg / per l / per piece — friendlier than per gram
function unitPriceDisplay(ing) {
  const per = unitPrice(ing);
  if (per === null) return null;
  const fam = UNITS[ing.packUnit].family;
  const mult = fam === 'count' ? 1 : 1000;
  return { value: per * mult, unit: baseUnitLabel(ing.packUnit) };
}

function ingredientsById() {
  return Object.fromEntries(Store.state.ingredients.map((i) => [i.id, i]));
}

function sortedIngredients() {
  return [...Store.state.ingredients].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), getLang() === 'ru' ? 'ru' : 'en')
  );
}

function sortedRecipes() {
  return [...Store.state.recipes].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), getLang() === 'ru' ? 'ru' : 'en')
  );
}

// ---------------- toast ----------------

function showToast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 350);
  }, 2200);
}

// ---------------- modal ----------------

let activeModal = null;

function openModal({ title, body }) {
  closeModal(null);
  const root = document.getElementById('modal-root');
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <button class="modal-close" data-modal-close aria-label="${esc(t('close'))}">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 2l12 12M14 2L2 14"/></svg>
        </button>
        <div class="modal-title">${esc(title)}</div>
        <span style="width:32px"></span>
      </div>
      <div class="modal-body">${body}</div>
    </div>`;
  root.appendChild(scrim);

  let resolver;
  const promise = new Promise((res) => (resolver = res));
  const close = (value) => {
    if (activeModal?.scrim === scrim) activeModal = null;
    scrim.remove();
    resolver(value);
  };
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim || e.target.closest('[data-modal-close]')) close(null);
  });
  activeModal = { scrim, close, promise };
  return activeModal;
}

function closeModal(value) {
  if (activeModal) activeModal.close(value);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal(null);
});

function confirmModal({ title, text, confirmLabel, danger = false }) {
  const m = openModal({
    title,
    body: `
      <p>${esc(text)}</p>
      <div class="modal-actions" style="padding:24px 0 0">
        <button class="btn btn-secondary" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn ${danger ? 'btn-primary' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button>
      </div>`,
  });
  m.scrim.querySelector('[data-confirm]').addEventListener('click', () => m.close(true));
  return m.promise.then((v) => v === true);
}

// ---------------- routing ----------------

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'ingredients') return { name: 'ingredients' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'cakes' && parts[1]) return { name: 'cake', id: parts[1] };
  return { name: 'cakes' };
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// ---------------- editor draft ----------------

let draft = null;          // recipe being edited
let selectedSizeId = null; // size chip selection in the summary
let saveTimer = null;
let focusNameOnRender = false;

function ensureDraft(id) {
  if (draft && draft.id === id) return draft;
  const rec = Store.state.recipes.find((r) => r.id === id);
  draft = rec ? structuredClone(rec) : null;
  selectedSizeId = draft?.sizes?.[0]?.id ?? null;
  return draft;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!draft) return;
    await Store.saveRecipe(structuredClone(draft));
    flashSaved();
  }, 600);
}

async function saveNow() {
  clearTimeout(saveTimer);
  if (!draft) return;
  await Store.saveRecipe(structuredClone(draft));
  flashSaved();
}

function flashSaved() {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  el.classList.add('visible');
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => el.classList.remove('visible'), 1600);
}

// ---------------- static chrome ----------------

function applyStaticI18n() {
  document.documentElement.lang = getLang();
  document.title = `${t('appName')} — ${t('tagline')}`;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

function updateModeBadge() {
  const cloud = Store.mode === 'cloud';
  modeBadge.className = 'mode-badge ' + (cloud ? 'cloud' : 'local');
  modeBadge.innerHTML = `<span class="dot"></span>${esc(cloud ? t('modeCloud') : t('modeLocal'))}`;
  modeBadge.title = cloud ? t('modeCloudTitle') : t('modeLocalTitle');
}

function updateActiveTab(routeName) {
  const map = { cakes: 'cakes', cake: 'cakes', ingredients: 'ingredients', settings: 'settings' };
  document.querySelectorAll('.tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === map[routeName]);
  });
}

// ---------------- views ----------------

function render() {
  const route = parseRoute();

  if (!Store.ready) {
    topnav.hidden = true;
    main.innerHTML = `<div class="boot-loading"><div class="spinner"></div></div>`;
    return;
  }

  if (Store.mode === 'cloud' && !Store.user) {
    topnav.hidden = true;
    main.innerHTML = viewAuth();
    wireAuth();
    return;
  }

  topnav.hidden = false;
  applyStaticI18n();
  updateModeBadge();
  updateActiveTab(route.name);

  if (route.name !== 'cake') {
    draft = null;
    clearTimeout(saveTimer);
  }

  if (route.name === 'cakes') main.innerHTML = viewCakes();
  else if (route.name === 'cake') {
    const d = ensureDraft(route.id);
    if (!d) {
      navigate('#/cakes');
      return;
    }
    main.innerHTML = viewCakeDetail(d);
    if (focusNameOnRender) {
      focusNameOnRender = false;
      const inp = document.getElementById('cake-name');
      if (inp) {
        inp.focus();
        inp.select();
      }
    }
  } else if (route.name === 'ingredients') main.innerHTML = viewIngredients();
  else if (route.name === 'settings') main.innerHTML = viewSettings();
}

// ----- cakes list -----

function viewCakes() {
  const recipes = sortedRecipes();
  const byId = ingredientsById();
  const localBanner =
    Store.mode === 'local'
      ? `<div class="banner">${esc(t('localBanner'))}</div>`
      : '';

  if (recipes.length === 0) {
    return `
      ${localBanner}
      <div class="empty">
        <div class="empty-emoji">🎂</div>
        <div class="empty-title">${esc(t('emptyCakesTitle'))}</div>
        <div class="empty-text">${esc(t('emptyCakesText'))}</div>
        <button class="btn btn-primary" data-action="new-cake">${esc(t('newCake'))}</button>
        <div class="empty-secondary">
          <button class="btn-text btn" data-action="add-sample">${esc(t('addSample'))}</button>
        </div>
      </div>`;
  }

  const cards = recipes
    .map((r) => {
      const costs = recipeCosts(r, byId, Store.state.settings);
      const minCost = Math.min(...costs.sizes.map((s) => s.fullCost));
      const name = r.name?.trim() || t('untitledCake');
      return `
        <div class="cake-card" data-action="open-cake" data-id="${esc(r.id)}" role="button" tabindex="0">
          <div class="cake-card-photo" style="background:${plateFor(r.id)}">
            <span class="cake-card-emoji">${esc(r.emoji || '🎂')}</span>
            <span class="cake-card-badge">${esc(fmtMoney(minCost, getLang()))}</span>
          </div>
          <div class="cake-card-meta">
            <div class="cake-card-title">${esc(name)}</div>
            <div class="cake-card-sub">${esc(tp('ingredientsCount', (r.items || []).length))} · ${esc(
              tp('sizesCount', (r.sizes || []).length || 1)
            )}</div>
            <div class="cake-card-price">${esc(t('costFrom'))} <b>${esc(fmtMoney(minCost, getLang()))}</b></div>
          </div>
        </div>`;
    })
    .join('');

  return `
    ${localBanner}
    <div class="page-head">
      <div>
        <h1 class="page-title">${esc(t('myCakes'))}</h1>
      </div>
      <button class="btn btn-primary" data-action="new-cake">${esc(t('newCake'))}</button>
    </div>
    <div class="card-grid">${cards}</div>`;
}

// ----- cake editor -----

function itemRowHtml(item, index, byId) {
  const ing = byId[item.ingredientId];
  const options = sortedIngredients()
    .map(
      (i) =>
        `<option value="${esc(i.id)}" ${i.id === item.ingredientId ? 'selected' : ''}>${esc(i.name)}</option>`
    )
    .join('');
  const placeholder = `<option value="" disabled ${!item.ingredientId ? 'selected' : ''}>${esc(
    t('chooseIngredient')
  )}</option>`;

  const units = ing ? compatibleUnits(ing.packUnit) : [item.unit || 'g'];
  const unitOptions = units
    .map((u) => `<option value="${esc(u)}" ${u === item.unit ? 'selected' : ''}>${esc(unitLabel(u))}</option>`)
    .join('');

  const r = itemCost(item, byId);
  const costHtml = r.warning
    ? `<span class="item-warn">${esc(t(warnKey(r.warning)))}</span>`
    : `<span>${esc(fmtMoney(r.cost, getLang()))}</span>`;

  return `
    <div class="item-row" data-index="${index}">
      <select class="select compact" data-item-field="ingredientId" data-index="${index}" aria-label="${esc(
        t('chooseIngredient')
      )}">
        ${placeholder}${options}
      </select>
      <input class="input compact" data-item-field="qty" data-index="${index}" inputmode="decimal"
        placeholder="${esc(t('qty'))}" value="${esc(numToInput(item.qty))}" aria-label="${esc(t('qty'))}">
      <select class="select compact" data-item-field="unit" data-index="${index}" aria-label="${esc(t('unit'))}">
        ${unitOptions}
      </select>
      <div class="item-cost" id="item-cost-${index}">${costHtml}</div>
      <button class="icon-btn subtle" data-action="remove-item" data-index="${index}" aria-label="${esc(t('delete'))}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M6.5 2.5h3M5.5 4.5V13a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V4.5M7 7v4.5M9 7v4.5"/></svg>
      </button>
    </div>`;
}

function warnKey(w) {
  return { missing: 'warnMissing', mismatch: 'warnMismatch', price: 'warnPrice' }[w] || 'warnMismatch';
}

function sizeRowHtml(size, index, costs) {
  const sz = costs.sizes.find((s) => s.id === size.id);
  const weight = sz && sz.weight > 0 ? fmtWeight(sz.weight, getLang()) : '';
  return `
    <div class="size-row" data-index="${index}">
      <input class="input compact" data-size-field="label" data-index="${index}"
        placeholder="${esc(t('sizeNamePlaceholder'))}" value="${esc(size.label)}" aria-label="${esc(t('sizes'))}">
      <div class="size-x">
        <span class="x-sign">×</span>
        <input class="input compact" data-size-field="multiplier" data-index="${index}" inputmode="decimal"
          value="${esc(numToInput(size.multiplier))}" aria-label="${esc(t('multiplierHint'))}" title="${esc(
            t('multiplierHint')
          )}">
      </div>
      <div class="size-weight" id="size-weight-${index}">${esc(weight)}</div>
      <button class="icon-btn subtle" data-action="remove-size" data-index="${index}" aria-label="${esc(t('delete'))}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M6.5 2.5h3M5.5 4.5V13a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V4.5M7 7v4.5M9 7v4.5"/></svg>
      </button>
    </div>`;
}

function summaryHtml(d) {
  const byId = ingredientsById();
  const costs = recipeCosts(d, byId, Store.state.settings);
  const sizes = costs.sizes;
  if (!sizes.find((s) => s.id === selectedSizeId)) selectedSizeId = sizes[0]?.id ?? null;
  const sel = sizes.find((s) => s.id === selectedSizeId) || sizes[0];

  const chips = sizes
    .map((s) => {
      const label = s.label?.trim() || `×${fmtNum(s.multiplier, getLang())}`;
      return `<button class="size-chip ${s.id === sel.id ? 'active' : ''}" data-action="select-size" data-id="${esc(
        s.id
      )}">${esc(label)}</button>`;
    })
    .join('');

  const lang = getLang();
  const laborMin = Number(d.laborMinutes) || 0;
  const laborCost = (laborMin / 60) * (Number(Store.state.settings.laborRate) || 0);
  const packCost = Number(d.packagingCost) || 0;

  const rows = [];
  rows.push(
    `<div class="summary-row"><span class="lbl">${esc(t('rowIngredients'))}</span><span class="val">${esc(
      fmtMoney(sel.rawCost, lang)
    )}</span></div>`
  );
  if (packCost > 0)
    rows.push(
      `<div class="summary-row"><span class="lbl">${esc(t('rowPackaging'))}</span><span class="val">${esc(
        fmtMoney(packCost, lang)
      )}</span></div>`
    );
  if (laborCost > 0)
    rows.push(
      `<div class="summary-row"><span class="lbl">${esc(t('rowLabor', { n: laborMin }))}</span><span class="val">${esc(
        fmtMoney(laborCost, lang)
      )}</span></div>`
    );
  if (sel.weight > 0) {
    rows.push(
      `<div class="summary-row"><span class="lbl">${esc(t('rowWeight'))}</span><span class="val">${esc(
        fmtWeight(sel.weight, lang)
      )}</span></div>`
    );
    if (sel.fullCost > 0)
      rows.push(
        `<div class="summary-row"><span class="lbl">${esc(t('rowCostPerKg'))}</span><span class="val">${esc(
          fmtMoney(sel.fullCost / (sel.weight / 1000), lang)
        )}</span></div>`
      );
  }

  const note =
    costs.marginPct > 0
      ? t('summaryNote', { n: fmtNum(costs.marginPct, lang) })
      : t('summaryNoMargin');

  return `
    <div class="summary-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>${esc(t('costTitle'))}</span>
      <span class="save-indicator" id="save-indicator">✓ ${esc(t('saved'))}</span>
    </div>
    ${sizes.length > 1 ? `<div class="summary-size-tabs">${chips}</div>` : ''}
    <div class="summary-rows">${rows.join('')}</div>
    <hr class="summary-divider">
    <div class="summary-total">
      <span class="lbl">${esc(t('rowFullCost'))}</span>
      <span class="val">${esc(fmtMoney(sel.fullCost, lang))}</span>
    </div>
    <div class="summary-price">
      <span class="lbl">${esc(t('rowPrice'))}</span>
      <span class="val">${esc(fmtMoney(sel.price, lang))}</span>
    </div>
    <div class="summary-note">${esc(note)}</div>`;
}

function viewCakeDetail(d) {
  const byId = ingredientsById();
  const costs = recipeCosts(d, byId, Store.state.settings);
  const hasIngredients = Store.state.ingredients.length > 0;

  const itemsHtml = (d.items || []).map((item, i) => itemRowHtml(item, i, byId)).join('');
  const sizesHtml = (d.sizes || []).map((s, i) => sizeRowHtml(s, i, costs)).join('');

  const compositionBody = hasIngredients
    ? `${itemsHtml}
       <button class="add-row-btn" data-action="add-item"><span class="plus">+</span>${esc(t('addIngredientRow'))}</button>`
    : `<div class="empty" style="padding:24px">
         <div class="empty-emoji">🧺</div>
         <div class="empty-title">${esc(t('noIngredientsYetTitle'))}</div>
         <div class="empty-text">${esc(t('noIngredientsYetText'))}</div>
         <button class="btn btn-secondary" data-action="go-ingredients">${esc(t('goToIngredients'))}</button>
       </div>`;

  const marginPlaceholder = t('marginDefaultPlaceholder', {
    n: fmtNum(Number(Store.state.settings.marginPct) || 0, getLang()),
  });

  return `
    <button class="back-link" data-action="back-to-cakes">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>
      ${esc(t('allCakes'))}
    </button>

    <div class="detail-layout">
      <div class="editor">
        <div class="editor-head">
          <button class="emoji-btn" data-action="pick-emoji" title="${esc(t('emojiPickerTitle'))}">${esc(
            d.emoji || '🎂'
          )}</button>
          <input class="name-input" id="cake-name" data-recipe-field="name"
            placeholder="${esc(t('cakeNamePlaceholder'))}" value="${esc(d.name)}">
        </div>

        <div class="section">
          <div class="section-title">${esc(t('composition'))}</div>
          ${compositionBody}
        </div>

        <div class="section">
          <div class="section-title-row">
            <div class="section-title">${esc(t('sizes'))}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary btn-sm" data-action="size-by-diameter">${esc(t('byDiameter'))}</button>
              <button class="btn btn-secondary btn-sm" data-action="size-by-weight">${esc(t('byWeight'))}</button>
            </div>
          </div>
          ${sizesHtml}
          <button class="add-row-btn" data-action="add-size"><span class="plus">+</span>${esc(t('addSize'))}</button>
        </div>

        <div class="section">
          <div class="section-title">${esc(t('extras'))}</div>
          <div class="form-grid">
            <div class="field">
              <label class="field-label">${esc(t('packagingCost'))}</label>
              <input class="input compact" data-recipe-field="packagingCost" inputmode="decimal"
                value="${esc(numToInput(d.packagingCost))}">
            </div>
            <div class="field">
              <label class="field-label">${esc(t('laborMinutes'))}</label>
              <input class="input compact" data-recipe-field="laborMinutes" inputmode="numeric"
                value="${esc(numToInput(d.laborMinutes))}">
            </div>
            <div class="field">
              <label class="field-label">${esc(t('marginPct'))}</label>
              <input class="input compact" data-recipe-field="marginPct" inputmode="decimal"
                placeholder="${esc(marginPlaceholder)}"
                value="${esc(d.marginPct === null || d.marginPct === undefined ? '' : numToInput(d.marginPct))}">
            </div>
          </div>
          <div class="settings-hint">${esc(t('extrasHint'))}</div>
        </div>

        <div class="section" style="display:flex;justify-content:flex-end">
          <button class="btn btn-danger-text" data-action="delete-cake">${esc(t('deleteCake'))}</button>
        </div>
      </div>

      <aside class="summary-card" id="summary-card">${summaryHtml(d)}</aside>
    </div>`;
}

function updateComputed() {
  if (!draft) return;
  const byId = ingredientsById();
  const costs = recipeCosts(draft, byId, Store.state.settings);

  (draft.items || []).forEach((item, i) => {
    const cell = document.getElementById(`item-cost-${i}`);
    if (!cell) return;
    const r = itemCost(item, byId);
    cell.innerHTML = r.warning
      ? `<span class="item-warn">${esc(t(warnKey(r.warning)))}</span>`
      : `<span>${esc(fmtMoney(r.cost, getLang()))}</span>`;
  });

  (draft.sizes || []).forEach((s, i) => {
    const cell = document.getElementById(`size-weight-${i}`);
    if (!cell) return;
    const sz = costs.sizes.find((x) => x.id === s.id);
    cell.textContent = sz && sz.weight > 0 ? fmtWeight(sz.weight, getLang()) : '';
  });

  const card = document.getElementById('summary-card');
  if (card) card.innerHTML = summaryHtml(draft);
}

// ----- ingredients -----

function viewIngredients() {
  const ings = sortedIngredients();
  const lang = getLang();

  if (ings.length === 0) {
    return `
      <div class="empty">
        <div class="empty-emoji">🧺</div>
        <div class="empty-title">${esc(t('emptyIngredientsTitle'))}</div>
        <div class="empty-text">${esc(t('emptyIngredientsText'))}</div>
        <button class="btn btn-primary" data-action="ing-new">${esc(t('addIngredient'))}</button>
      </div>`;
  }

  const rows = ings
    .map((i) => {
      const up = unitPriceDisplay(i);
      const upHtml = up
        ? `<b>${esc(fmtMoney(up.value, lang))}</b> <span>${esc(t('perUnit', { unit: up.unit }))}</span>`
        : `<span class="item-warn">${esc(t('warnPrice'))}</span>`;
      return `
        <div class="ing-row">
          <div style="min-width:0">
            <div class="ing-name">${esc(i.name)}</div>
            <div class="ing-pack">${esc(fmtNum(Number(i.packQty) || 0, lang))} ${esc(unitLabel(i.packUnit))} — ${esc(
              fmtMoney(Number(i.packPrice) || 0, lang)
            )}</div>
          </div>
          <div class="ing-unitcost">${upHtml}</div>
          <button class="icon-btn" data-action="ing-edit" data-id="${esc(i.id)}" aria-label="${esc(t('editIngredient'))}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m11.5 2.5 2 2L6 12l-2.7.7L4 10l7.5-7.5Z"/></svg>
          </button>
          <button class="icon-btn" data-action="ing-delete" data-id="${esc(i.id)}" aria-label="${esc(t('delete'))}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M6.5 2.5h3M5.5 4.5V13a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1V4.5M7 7v4.5M9 7v4.5"/></svg>
          </button>
        </div>`;
    })
    .join('');

  return `
    <div class="page-head">
      <h1 class="page-title">${esc(t('ingredientsTitle'))}</h1>
      <button class="btn btn-primary" data-action="ing-new">${esc(t('newIngredient'))}</button>
    </div>
    <div class="ing-list">${rows}</div>`;
}

function ingredientModal(existing) {
  const ing = existing || { id: uid(), name: '', packQty: '', packUnit: 'kg', packPrice: '' };
  const unitOptions = ['g', 'kg', 'ml', 'l', 'pcs']
    .map((u) => `<option value="${u}" ${u === ing.packUnit ? 'selected' : ''}>${esc(unitLabel(u))}</option>`)
    .join('');

  const m = openModal({
    title: existing ? t('editIngredient') : t('newIngredient'),
    body: `
      <div class="field" style="margin-bottom:16px">
        <label class="field-label">${esc(t('ingName'))}</label>
        <input class="input" id="ing-name" placeholder="${esc(t('ingNamePlaceholder'))}" value="${esc(ing.name)}">
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 100px 1fr">
        <div class="field">
          <label class="field-label">${esc(t('packQty'))}</label>
          <input class="input" id="ing-qty" inputmode="decimal" value="${esc(numToInput(ing.packQty))}">
        </div>
        <div class="field">
          <label class="field-label">${esc(t('packUnit'))}</label>
          <select class="select" id="ing-unit">${unitOptions}</select>
        </div>
        <div class="field">
          <label class="field-label">${esc(t('packPrice'))}</label>
          <input class="input" id="ing-price" inputmode="decimal" value="${esc(numToInput(ing.packPrice))}">
        </div>
      </div>
      <div class="field-error" id="ing-error" style="margin-top:12px"></div>
      <div class="modal-actions" style="padding:24px 0 0">
        <button class="btn btn-secondary" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="ing-save">${esc(t('saveIngredient'))}</button>
      </div>`,
  });

  const $ = (id) => m.scrim.querySelector('#' + id);
  $('ing-save').addEventListener('click', () => {
    const name = $('ing-name').value.trim();
    const qty = parseNum($('ing-qty').value);
    const price = parseNum($('ing-price').value);
    const unit = $('ing-unit').value;
    if (!name || qty === null || qty <= 0 || price === null || price < 0) {
      $('ing-error').textContent = t('errGeneric');
      if (!name) $('ing-name').focus();
      else if (qty === null || qty <= 0) $('ing-qty').focus();
      else $('ing-price').focus();
      return;
    }
    m.close({ id: ing.id, name, packQty: qty, packUnit: unit, packPrice: price });
  });
  setTimeout(() => $('ing-name').focus(), 50);
  return m.promise;
}

// ----- settings -----

function viewSettings() {
  const s = Store.state.settings;
  const lang = getLang();
  const cloud = Store.mode === 'cloud';

  const accountBlock = cloud
    ? `
      <div class="settings-block">
        <div class="settings-block-title">${esc(t('accountBlock'))}</div>
        <p style="font-size:14px;color:var(--muted);margin-bottom:16px">${esc(
          t('signedInAs', { email: Store.user?.email || '' })
        )}</p>
        <button class="btn btn-secondary" data-action="sign-out">${esc(t('signOut'))}</button>
      </div>`
    : `
      <div class="settings-block">
        <div class="settings-block-title">${esc(t('accountBlock'))}</div>
        <div class="banner" style="margin-bottom:0">${esc(t('localBanner'))}</div>
      </div>`;

  return `
    <div class="page-head">
      <h1 class="page-title">${esc(t('settingsTitle'))}</h1>
    </div>

    <div class="settings-block">
      <div class="settings-block-title">${esc(t('languageBlock'))}</div>
      <div class="lang-toggle">
        <button class="size-chip ${lang === 'ru' ? 'active' : ''}" data-action="set-lang" data-lang="ru">Русский</button>
        <button class="size-chip ${lang === 'en' ? 'active' : ''}" data-action="set-lang" data-lang="en">English</button>
      </div>
    </div>

    <div class="settings-block">
      <div class="settings-block-title">${esc(t('calcBlock'))}</div>
      <div class="settings-row">
        <div class="field">
          <label class="field-label">${esc(t('laborRateLabel'))}</label>
          <input class="input compact" data-setting="laborRate" inputmode="decimal" value="${esc(
            numToInput(s.laborRate)
          )}">
        </div>
      </div>
      <div class="settings-hint">${esc(t('laborRateHint'))}</div>
      <div class="settings-row" style="margin-top:8px">
        <div class="field">
          <label class="field-label">${esc(t('defaultMarginLabel'))}</label>
          <input class="input compact" data-setting="marginPct" inputmode="decimal" value="${esc(
            numToInput(s.marginPct)
          )}">
        </div>
      </div>
      <div class="settings-hint">${esc(t('defaultMarginHint'))}</div>
    </div>

    <div class="settings-block">
      <div class="settings-block-title">${esc(t('backupBlock'))}</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <button class="btn btn-secondary" data-action="export-data">${esc(t('exportBtn'))}</button>
        <button class="btn btn-secondary" data-action="import-data">${esc(t('importBtn'))}</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      <div class="settings-hint">${esc(t('backupHint'))}</div>
    </div>

    ${accountBlock}`;
}

// ----- auth -----

function viewAuth() {
  return `
    <div class="auth-wrap">
      <form class="auth-card" id="auth-form">
        <div class="auth-logo">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 3c-1.5 2-2.5 3.2-2.5 4.7a2.5 2.5 0 0 0 5 0C18.5 6.2 17.5 5 16 3Z" fill="currentColor"/>
            <path d="M8 15c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v1.2c0 1.5-1.2 2.8-2.8 2.8-1 0-1.9-.5-2.4-1.3-.5.8-1.4 1.3-2.4 1.3h-.8c-1 0-1.9-.5-2.4-1.3-.5.8-1.4 1.3-2.4 1.3A2.8 2.8 0 0 1 8 16.2V15Z" fill="currentColor"/>
            <path d="M7 21h18v5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5Z" fill="currentColor"/>
          </svg>
        </div>
        <div class="auth-title">${esc(t('authTitle'))}</div>
        <div class="auth-sub">${esc(t('authSub'))}</div>
        <div class="auth-error" id="auth-error" hidden></div>
        <div class="field">
          <label class="field-label" for="auth-email">${esc(t('email'))}</label>
          <input class="input" id="auth-email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label class="field-label" for="auth-pass">${esc(t('password'))}</label>
          <input class="input" id="auth-pass" type="password" autocomplete="current-password" required>
        </div>
        <button class="btn btn-primary" id="auth-submit" type="submit">${esc(t('signIn'))}</button>
        <div class="auth-links">
          <button type="button" id="auth-forgot">${esc(t('forgotPassword'))}</button>
        </div>
      </form>
    </div>`;
}

function wireAuth() {
  const form = document.getElementById('auth-form');
  const errBox = document.getElementById('auth-error');
  const submit = document.getElementById('auth-submit');

  const showErr = (msg) => {
    errBox.textContent = msg;
    errBox.hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    submit.disabled = true;
    submit.textContent = t('signingIn');
    try {
      await Store.signIn(
        document.getElementById('auth-email').value.trim(),
        document.getElementById('auth-pass').value
      );
      // onAuthStateChanged re-renders
    } catch (err) {
      showErr(authErrorMessage(err));
      submit.disabled = false;
      submit.textContent = t('signIn');
    }
  });

  document.getElementById('auth-forgot').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) {
      showErr(t('resetNeedEmail'));
      return;
    }
    try {
      await Store.resetPassword(email);
      openModal({
        title: t('resetSentTitle'),
        body: `<p>${esc(t('resetSentText', { email }))}</p>
          <div class="modal-actions" style="padding:24px 0 0">
            <button class="btn btn-primary" data-modal-close>${esc(t('close'))}</button>
          </div>`,
      });
    } catch (err) {
      showErr(authErrorMessage(err));
    }
  });
}

function authErrorMessage(err) {
  const code = err?.code || '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found') ||
    code.includes('invalid-email')
  )
    return t('errInvalidCreds');
  if (code.includes('too-many-requests')) return t('errTooMany');
  if (code.includes('network-request-failed')) return t('errNetwork');
  return t('errGeneric');
}

// ---------------- size helper modals ----------------

function sizeHelperDiameter() {
  const m = openModal({
    title: t('diameterModalTitle'),
    body: `
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="field">
          <label class="field-label">${esc(t('diameterBase'))}</label>
          <input class="input" id="dia-base" inputmode="decimal">
        </div>
        <div class="field">
          <label class="field-label">${esc(t('diameterNew'))}</label>
          <input class="input" id="dia-new" inputmode="decimal">
        </div>
      </div>
      <p style="margin-top:12px">${esc(t('diameterNote'))}</p>
      <div class="modal-actions" style="padding:24px 0 0">
        <button class="btn btn-secondary" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="dia-apply">${esc(t('apply'))}</button>
      </div>`,
  });
  m.scrim.querySelector('#dia-apply').addEventListener('click', () => {
    const k = multiplierFromDiameter(
      parseNum(m.scrim.querySelector('#dia-base').value),
      parseNum(m.scrim.querySelector('#dia-new').value)
    );
    if (k === null) return;
    const base = parseNum(m.scrim.querySelector('#dia-base').value);
    const next = parseNum(m.scrim.querySelector('#dia-new').value);
    m.close({ multiplier: Math.round(k * 100) / 100, label: `${fmtNum(next, getLang())} ${getLang() === 'ru' ? 'см' : 'cm'}` });
  });
  setTimeout(() => m.scrim.querySelector('#dia-base').focus(), 50);
  return m.promise;
}

function sizeHelperWeight(baseWeightG) {
  const lang = getLang();
  const known = baseWeightG > 0;
  const m = openModal({
    title: t('weightModalTitle'),
    body: known
      ? `
      <div class="summary-row" style="padding-bottom:12px">
        <span class="lbl">${esc(t('weightBase'))}</span>
        <span class="val"><b>${esc(fmtWeight(baseWeightG, lang))}</b></span>
      </div>
      <div class="field">
        <label class="field-label">${esc(t('weightTarget'))}</label>
        <input class="input" id="wt-target" inputmode="decimal">
      </div>
      <p style="margin-top:12px">${esc(t('weightNote'))}</p>
      <div class="modal-actions" style="padding:24px 0 0">
        <button class="btn btn-secondary" data-modal-close>${esc(t('cancel'))}</button>
        <button class="btn btn-primary" id="wt-apply">${esc(t('apply'))}</button>
      </div>`
      : `<p>${esc(t('weightUnknown'))}</p>
      <div class="modal-actions" style="padding:24px 0 0">
        <button class="btn btn-primary" data-modal-close>${esc(t('close'))}</button>
      </div>`,
  });
  if (known) {
    m.scrim.querySelector('#wt-apply').addEventListener('click', () => {
      const target = parseNum(m.scrim.querySelector('#wt-target').value);
      const k = multiplierFromWeight(baseWeightG, target);
      if (k === null) return;
      const label =
        target >= 1000
          ? `${fmtNum(target / 1000, lang)} ${lang === 'ru' ? 'кг' : 'kg'}`
          : `${fmtNum(target, lang)} ${lang === 'ru' ? 'г' : 'g'}`;
      m.close({ multiplier: Math.round(k * 100) / 100, label });
    });
    setTimeout(() => m.scrim.querySelector('#wt-target').focus(), 50);
  }
  return m.promise;
}

function emojiModal(current) {
  const grid = EMOJIS.map(
    (e) => `<button data-emoji="${e}" class="${e === current ? 'selected' : ''}">${e}</button>`
  ).join('');
  const m = openModal({
    title: t('emojiPickerTitle'),
    body: `<div class="emoji-grid">${grid}</div>`,
  });
  m.scrim.querySelector('.emoji-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (btn) m.close(btn.dataset.emoji);
  });
  return m.promise;
}

// ---------------- sample data ----------------

async function addSampleData() {
  const ru = getLang() === 'ru';
  const mk = (name, packQty, packUnit, packPrice) => ({ id: uid(), name, packQty, packUnit, packPrice });
  const flour = mk(ru ? 'Мука пшеничная' : 'Wheat flour', 1, 'kg', 1.2);
  const butter = mk(ru ? 'Масло сливочное' : 'Butter', 0.5, 'kg', 4.5);
  const milk = mk(ru ? 'Молоко' : 'Milk', 1, 'l', 1.1);
  const sugar = mk(ru ? 'Сахар' : 'Sugar', 1, 'kg', 1.3);
  const eggs = mk(ru ? 'Яйца' : 'Eggs', 10, 'pcs', 2.8);
  const condensed = mk(ru ? 'Сгущённое молоко' : 'Condensed milk', 400, 'g', 2.2);

  for (const ing of [flour, butter, milk, sugar, eggs, condensed]) {
    await Store.saveIngredient(ing);
  }

  const recipe = {
    id: uid(),
    name: ru ? 'Наполеон' : 'Napoleon',
    emoji: '🍰',
    items: [
      { ingredientId: flour.id, qty: 600, unit: 'g' },
      { ingredientId: butter.id, qty: 400, unit: 'g' },
      { ingredientId: milk.id, qty: 500, unit: 'ml' },
      { ingredientId: sugar.id, qty: 150, unit: 'g' },
      { ingredientId: eggs.id, qty: 3, unit: 'pcs' },
      { ingredientId: condensed.id, qty: 200, unit: 'g' },
    ],
    sizes: [
      { id: uid(), label: ru ? 'База' : 'Base', multiplier: 1 },
      { id: uid(), label: ru ? '16 см' : '16 cm', multiplier: 0.7 },
      { id: uid(), label: ru ? '24 см' : '24 cm', multiplier: 1.5 },
    ],
    packagingCost: 1.5,
    laborMinutes: 90,
    marginPct: null,
  };
  await Store.saveRecipe(recipe);
  showToast(t('sampleAdded'));
  render();
}

// ---------------- backup ----------------

function downloadBackup() {
  const data = Store.exportData();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `konditer-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast(t('exportDone'));
}

function pickImportFile() {
  const input = document.getElementById('import-file');
  if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showToast(t('importError'));
      return;
    }
    if (!Store.validateImport(data)) {
      showToast(t('importError'));
      return;
    }
    const ok = await confirmModal({
      title: t('importConfirmTitle'),
      text: t('importConfirmText', { name: file.name }),
      confirmLabel: t('importBtn'),
    });
    if (!ok) return;
    await Store.importData(data);
    showToast(t('importDone'));
    render();
  };
  input.click();
}

// ---------------- migration check ----------------

let migrationChecked = false;

async function maybeOfferMigration() {
  if (migrationChecked) return;
  if (Store.mode !== 'cloud' || !Store.user || !Store.ready) return;
  migrationChecked = true;
  if (!Store.hasLocalData() || !Store.cloudIsEmpty()) return;

  const ok = await confirmModal({
    title: t('migrateTitle'),
    text: t('migrateText'),
    confirmLabel: t('migrateYes'),
  });
  if (ok) {
    await Store.migrateLocalToCloud();
    showToast(t('migrateDone'));
  } else {
    Store.dismissLocalData();
  }
  render();
}

// ---------------- event wiring ----------------

const actions = {
  'new-cake': async () => {
    const recipe = {
      id: uid(),
      name: '',
      emoji: '🎂',
      items: [],
      sizes: [{ id: uid(), label: t('baseSizeLabel'), multiplier: 1 }],
      packagingCost: 0,
      laborMinutes: 0,
      marginPct: null,
    };
    await Store.saveRecipe(recipe);
    focusNameOnRender = true;
    navigate(`#/cakes/${recipe.id}`);
  },

  'open-cake': (el) => navigate(`#/cakes/${el.dataset.id}`),
  'back-to-cakes': () => navigate('#/cakes'),
  'go-ingredients': () => navigate('#/ingredients'),
  'add-sample': () => addSampleData(),

  'add-item': async () => {
    if (!draft) return;
    const first = sortedIngredients()[0];
    draft.items = draft.items || [];
    draft.items.push({
      ingredientId: '',
      qty: 0,
      unit: first ? compatibleUnits(first.packUnit)[0] : 'g',
    });
    await saveNow();
    render();
  },

  'remove-item': async (el) => {
    if (!draft) return;
    draft.items.splice(Number(el.dataset.index), 1);
    await saveNow();
    render();
  },

  'add-size': async () => {
    if (!draft) return;
    draft.sizes = draft.sizes || [];
    draft.sizes.push({ id: uid(), label: '', multiplier: 1 });
    await saveNow();
    render();
  },

  'remove-size': async (el) => {
    if (!draft) return;
    draft.sizes.splice(Number(el.dataset.index), 1);
    if (draft.sizes.length === 0) draft.sizes.push({ id: uid(), label: t('baseSizeLabel'), multiplier: 1 });
    await saveNow();
    render();
  },

  'size-by-diameter': async () => {
    if (!draft) return;
    const res = await sizeHelperDiameter();
    if (!res) return;
    draft.sizes.push({ id: uid(), label: res.label, multiplier: res.multiplier });
    await saveNow();
    render();
  },

  'size-by-weight': async () => {
    if (!draft) return;
    const byId = ingredientsById();
    const costs = recipeCosts(draft, byId, Store.state.settings);
    const res = await sizeHelperWeight(costs.baseWeight);
    if (!res) return;
    draft.sizes.push({ id: uid(), label: res.label, multiplier: res.multiplier });
    await saveNow();
    render();
  },

  'select-size': (el) => {
    selectedSizeId = el.dataset.id;
    if (draft) {
      const card = document.getElementById('summary-card');
      if (card) card.innerHTML = summaryHtml(draft);
    }
  },

  'pick-emoji': async () => {
    if (!draft) return;
    const emoji = await emojiModal(draft.emoji);
    if (!emoji) return;
    draft.emoji = emoji;
    await saveNow();
    render();
  },

  'delete-cake': async () => {
    if (!draft) return;
    const name = draft.name?.trim() || t('untitledCake');
    const ok = await confirmModal({
      title: t('confirmDeleteCakeTitle'),
      text: t('confirmDeleteCakeText', { name }),
      confirmLabel: t('delete'),
      danger: true,
    });
    if (!ok) return;
    const id = draft.id;
    draft = null;
    await Store.deleteRecipe(id);
    navigate('#/cakes');
  },

  'ing-new': async () => {
    const ing = await ingredientModal(null);
    if (!ing) return;
    await Store.saveIngredient(ing);
    render();
  },

  'ing-edit': async (el) => {
    const existing = Store.state.ingredients.find((i) => i.id === el.dataset.id);
    if (!existing) return;
    const ing = await ingredientModal(existing);
    if (!ing) return;
    await Store.saveIngredient(ing);
    render();
  },

  'ing-delete': async (el) => {
    const ing = Store.state.ingredients.find((i) => i.id === el.dataset.id);
    if (!ing) return;
    const usedIn = Store.state.recipes.filter((r) =>
      (r.items || []).some((it) => it.ingredientId === ing.id)
    ).length;
    const text = usedIn
      ? t('confirmDeleteIngUsed', { name: ing.name, usage: tp('usageIn', usedIn) })
      : t('confirmDeleteIngText', { name: ing.name });
    const ok = await confirmModal({
      title: t('confirmDeleteIngTitle'),
      text,
      confirmLabel: t('delete'),
      danger: true,
    });
    if (!ok) return;
    await Store.deleteIngredient(ing.id);
    render();
  },

  'set-lang': (el) => {
    setLang(el.dataset.lang);
    applyStaticI18n();
    render();
  },

  'export-data': () => downloadBackup(),
  'import-data': () => pickImportFile(),

  'sign-out': async () => {
    const ok = await confirmModal({
      title: t('confirmSignOutTitle'),
      text: t('confirmSignOutText'),
      confirmLabel: t('signOut'),
    });
    if (!ok) return;
    migrationChecked = false;
    await Store.signOut();
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    if (el.tagName === 'A') e.preventDefault?.call(e); // anchors: let hash update happen naturally
    fn(el);
  }
});

// keyboard "open cake" for card focus
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target.closest?.('[data-action="open-cake"]');
  if (el) navigate(`#/cakes/${el.dataset.id}`);
});

// live edits in the recipe editor
main.addEventListener('input', (e) => {
  const el = e.target;

  if (el.dataset.recipeField && draft) {
    const f = el.dataset.recipeField;
    if (f === 'name') draft.name = el.value;
    else if (f === 'marginPct') {
      const n = parseNum(el.value);
      draft.marginPct = el.value.trim() === '' ? null : n ?? 0;
    } else {
      draft[f] = parseNum(el.value) ?? 0;
    }
    scheduleSave();
    updateComputed();
    return;
  }

  if (el.dataset.itemField && draft) {
    const i = Number(el.dataset.index);
    const item = draft.items?.[i];
    if (!item) return;
    if (el.dataset.itemField === 'qty') {
      item.qty = parseNum(el.value) ?? 0;
      scheduleSave();
      updateComputed();
    }
    return;
  }

  if (el.dataset.sizeField && draft) {
    const i = Number(el.dataset.index);
    const size = draft.sizes?.[i];
    if (!size) return;
    if (el.dataset.sizeField === 'label') size.label = el.value;
    else if (el.dataset.sizeField === 'multiplier') {
      const n = parseNum(el.value);
      if (n !== null && n > 0) size.multiplier = n;
    }
    scheduleSave();
    updateComputed();
  }
});

// selects & settings commit on change
main.addEventListener('change', async (e) => {
  const el = e.target;

  if (el.dataset.itemField && draft) {
    const i = Number(el.dataset.index);
    const item = draft.items?.[i];
    if (!item) return;
    if (el.dataset.itemField === 'ingredientId') {
      item.ingredientId = el.value;
      const ing = ingredientsById()[el.value];
      if (ing) {
        const units = compatibleUnits(ing.packUnit);
        if (!units.includes(item.unit)) item.unit = units[0];
      }
      await saveNow();
      render();
    } else if (el.dataset.itemField === 'unit') {
      item.unit = el.value;
      await saveNow();
      updateComputed();
    }
    return;
  }

  if (el.dataset.setting) {
    const n = parseNum(el.value) ?? 0;
    // No render() here: it would rebuild the form and steal focus from the
    // field the user just tabbed/clicked into. Inputs already show the value.
    await Store.saveSettings({ [el.dataset.setting]: n });
  }
});

// ---------------- boot ----------------

let bootRendered = false;

function onStoreChange() {
  updateModeBadge();
  maybeOfferMigration();

  // Don't yank the DOM out from under a focused field (cloud snapshot echoes).
  const ae = document.activeElement;
  const typing =
    ae &&
    main.contains(ae) &&
    (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA');
  if (typing && bootRendered) return;

  bootRendered = true;
  render();
}

window.addEventListener('hashchange', render);

applyStaticI18n();
Store.init({
  onChange: onStoreChange,
  onAuthChange: () => {
    migrationChecked = false;
    render();
  },
});
