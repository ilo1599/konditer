// ============================================================
// i18n.js — Russian (default) and English dictionaries.
// t(key, vars) interpolates {placeholders}.
// plural(n, key) picks the right Russian plural form.
// ============================================================

const LANG_KEY = 'konditer-lang';

const dict = {
  ru: {
    appName: 'Кондитер',
    tagline: 'калькуляция тортов',

    navCakes: 'Торты',
    navIngredients: 'Ингредиенты',
    navSettings: 'Настройки',

    modeCloud: 'Облако',
    modeLocal: 'Локально',
    modeCloudTitle: 'Данные сохраняются в облаке и доступны после входа с любого устройства',
    modeLocalTitle: 'Данные хранятся только в этом браузере',

    // cakes list
    myCakes: 'Мои торты',
    newCake: 'Новый торт',
    untitledCake: 'Без названия',
    costFrom: 'себестоимость от',
    emptyCakesTitle: 'Пока нет ни одного торта',
    emptyCakesText: 'Добавьте первый торт — и «Кондитер» посчитает его себестоимость и подскажет цену.',
    addSample: 'Добавить пример — «Наполеон»',
    ingredientsCount: { one: '{n} ингредиент', few: '{n} ингредиента', many: '{n} ингредиентов' },
    sizesCount: { one: '{n} размер', few: '{n} размера', many: '{n} размеров' },

    // cake editor
    allCakes: 'Все торты',
    cakeNamePlaceholder: 'Название торта…',
    composition: 'Состав',
    addIngredientRow: 'Добавить ингредиент',
    chooseIngredient: 'Выберите ингредиент…',
    qty: 'Кол-во',
    unit: 'Ед.',
    warnMissing: 'ингредиент удалён',
    warnMismatch: 'единицы несовместимы',
    warnPrice: 'нет цены упаковки',
    noIngredientsYetTitle: 'Сначала нужны ингредиенты',
    noIngredientsYetText: 'Добавьте ингредиенты с ценами в разделе «Ингредиенты» — из них будут складываться рецепты.',
    goToIngredients: 'К ингредиентам',

    sizes: 'Размеры',
    addSize: 'Добавить размер',
    sizeNamePlaceholder: 'Напр. «20 см» или «2 кг»',
    baseSizeLabel: 'База',
    multiplierHint: 'коэффициент от базового рецепта',
    byDiameter: 'По диаметру',
    byWeight: 'По весу',
    diameterModalTitle: 'Коэффициент по диаметру',
    diameterBase: 'Диаметр базового торта (см)',
    diameterNew: 'Диаметр нового размера (см)',
    diameterNote: 'Высота торта считается одинаковой: коэффициент = (новый ÷ базовый)².',
    weightModalTitle: 'Коэффициент по весу',
    weightBase: 'Вес базового рецепта',
    weightTarget: 'Нужный вес (г)',
    weightNote: 'Коэффициент = нужный вес ÷ вес базового рецепта.',
    apply: 'Применить',
    weightUnknown: 'Сначала заполните состав — вес базового рецепта пока неизвестен.',
    sizeHelperError: 'Введите оба значения числами.',

    extras: 'Дополнительно',
    packagingCost: 'Упаковка, € за торт',
    laborMinutes: 'Время работы, минут',
    marginPct: 'Наценка, %',
    marginDefaultPlaceholder: 'по умолчанию: {n}%',
    extrasHint: 'Упаковка и работа считаются за торт целиком и не зависят от размера. Ставка за час работы — в настройках.',

    deleteCake: 'Удалить торт',
    confirmDeleteCakeTitle: 'Удалить торт?',
    confirmDeleteCakeText: 'Торт «{name}» будет удалён навсегда.',

    // summary
    costTitle: 'Себестоимость',
    rowIngredients: 'Ингредиенты',
    rowPackaging: 'Упаковка',
    rowLabor: 'Работа ({n} мин)',
    rowFullCost: 'Итого себестоимость',
    rowPrice: 'Рекомендуемая цена',
    rowWeight: 'Вес',
    rowCostPerKg: 'Себестоимость за кг',
    summaryNote: 'Цена = себестоимость + наценка {n}%.',
    summaryNoMargin: 'Наценка не задана — рекомендуемая цена равна себестоимости. Задайте наценку в настройках или в разделе «Дополнительно».',
    weightApprox: 'Вес указан примерно: для ингредиентов в штуках заполните «Вес 1 шт» в разделе «Ингредиенты».',
    saved: 'Сохранено',
    saveError: 'Не удалось сохранить. Проверьте соединение — изменения останутся на экране.',
    loadError: 'Не удалось загрузить данные. Проверьте интернет и обновите страницу.',
    cdnError: 'Не удалось подключиться к базе данных. Проверьте интернет и обновите страницу.',
    reload: 'Обновить страницу',

    // ingredients
    ingredientsTitle: 'Ингредиенты',
    newIngredient: 'Новый ингредиент',
    ingName: 'Название',
    ingNamePlaceholder: 'Напр. «Мука пшеничная»',
    packQty: 'В упаковке',
    packUnit: 'Ед.',
    packPrice: 'Цена упаковки, €',
    perUnit: 'за {unit}',
    editIngredient: 'Изменить',
    emptyIngredientsTitle: 'Пока нет ингредиентов',
    emptyIngredientsText: 'Добавьте продукты, из которых печёте: название, размер упаковки и её цену. Например: мука — 1 кг — 1,20 €.',
    addIngredient: 'Добавить ингредиент',
    saveIngredient: 'Сохранить',
    confirmDeleteIngTitle: 'Удалить ингредиент?',
    confirmDeleteIngText: 'Ингредиент «{name}» будет удалён.',
    confirmDeleteIngUsed: 'Ингредиент «{name}» используется {usage}. В этих рецептах он будет помечен как удалённый.',
    usageIn: { one: 'в {n} рецепте', few: 'в {n} рецептах', many: 'в {n} рецептах' },
    ingFormError: 'Заполните название, количество в упаковке и цену.',
    gramsPerPiece: 'Вес 1 шт, г',
    gramsPerPieceHint: 'Нужен только для расчёта веса торта. Напр. яйцо — 55 г. Можно оставить пустым.',
    gramsPerPieceError: 'Вес 1 шт должен быть числом больше нуля — или оставьте поле пустым.',

    // settings
    settingsTitle: 'Настройки',
    languageBlock: 'Язык',
    calcBlock: 'Расчёты',
    laborRateLabel: 'Ставка за час работы, €',
    laborRateHint: 'Используется, если в рецепте указано время работы.',
    defaultMarginLabel: 'Наценка по умолчанию, %',
    defaultMarginHint: 'Применяется ко всем тортам, где наценка не задана отдельно.',
    backupBlock: 'Резервная копия',
    exportBtn: 'Скачать копию данных',
    importBtn: 'Восстановить из файла',
    backupHint: 'Файл с копией всех рецептов и цен. Сохраняйте его время от времени в надёжное место.',
    importConfirmTitle: 'Восстановить данные?',
    importConfirmText: 'Текущие данные будут заменены данными из файла «{name}».',
    importDone: 'Данные восстановлены',
    importError: 'Не удалось прочитать файл. Убедитесь, что это копия данных «Кондитера».',
    exportDone: 'Копия сохранена в загрузки',
    accountBlock: 'Аккаунт',
    signedInAs: 'Вы вошли как {email}',
    signOut: 'Выйти',
    confirmSignOutTitle: 'Выйти из аккаунта?',
    confirmSignOutText: 'Данные останутся в облаке. Для входа понадобится пароль.',
    localBanner: 'Локальный режим: данные хранятся только в этом браузере на этом компьютере. Не очищайте данные браузера и делайте резервные копии.',

    // auth
    authTitle: 'Добро пожаловать!',
    authSub: 'Войдите, чтобы открыть ваши рецепты',
    email: 'Эл. почта',
    password: 'Пароль',
    signIn: 'Войти',
    signingIn: 'Входим…',
    forgotPassword: 'Забыли пароль?',
    resetSentTitle: 'Письмо отправлено',
    resetSentText: 'Проверьте почту {email} — там ссылка для смены пароля.',
    resetNeedEmail: 'Введите эл. почту, затем нажмите «Забыли пароль?»',
    errInvalidCreds: 'Неверная почта или пароль.',
    errTooMany: 'Слишком много попыток. Подождите немного и попробуйте снова.',
    errNetwork: 'Нет соединения с интернетом. Проверьте сеть и попробуйте снова.',
    errGeneric: 'Что-то пошло не так. Попробуйте ещё раз.',

    // migration
    migrateTitle: 'Найдены данные на этом компьютере',
    migrateText: 'Здесь сохранены рецепты из локального режима. Перенести их в облачный аккаунт?',
    migrateYes: 'Перенести',
    migrateNo: 'Не переносить',
    migrateLater: 'Спросить позже',
    migrateDone: 'Данные перенесены в облако',

    // emoji picker
    emojiPickerTitle: 'Значок торта',

    // aria
    ariaMainNav: 'Основная навигация',
    ariaLoading: 'Загрузка',

    // misc
    cancel: 'Отмена',
    delete: 'Удалить',
    close: 'Закрыть',
    add: 'Добавить',
    sampleAdded: 'Пример добавлен',
  },

  en: {
    appName: 'Konditer',
    tagline: 'cake costing',

    navCakes: 'Cakes',
    navIngredients: 'Ingredients',
    navSettings: 'Settings',

    modeCloud: 'Cloud',
    modeLocal: 'Local',
    modeCloudTitle: 'Data is stored in the cloud and available on any device after sign-in',
    modeLocalTitle: 'Data is stored only in this browser',

    myCakes: 'My cakes',
    newCake: 'New cake',
    untitledCake: 'Untitled',
    costFrom: 'cost from',
    emptyCakesTitle: 'No cakes yet',
    emptyCakesText: 'Add your first cake — Konditer will work out its cost and suggest a price.',
    addSample: 'Add example — “Napoleon”',
    ingredientsCount: { one: '{n} ingredient', many: '{n} ingredients' },
    sizesCount: { one: '{n} size', many: '{n} sizes' },

    allCakes: 'All cakes',
    cakeNamePlaceholder: 'Cake name…',
    composition: 'Ingredients',
    addIngredientRow: 'Add ingredient',
    chooseIngredient: 'Choose an ingredient…',
    qty: 'Qty',
    unit: 'Unit',
    warnMissing: 'ingredient deleted',
    warnMismatch: 'incompatible units',
    warnPrice: 'no pack price',
    noIngredientsYetTitle: 'Ingredients come first',
    noIngredientsYetText: 'Add ingredients with prices in the “Ingredients” tab — recipes are built from them.',
    goToIngredients: 'Go to ingredients',

    sizes: 'Sizes',
    addSize: 'Add size',
    sizeNamePlaceholder: 'E.g. “20 cm” or “2 kg”',
    baseSizeLabel: 'Base',
    multiplierHint: 'multiplier of the base recipe',
    byDiameter: 'By diameter',
    byWeight: 'By weight',
    diameterModalTitle: 'Multiplier from diameter',
    diameterBase: 'Base cake diameter (cm)',
    diameterNew: 'New size diameter (cm)',
    diameterNote: 'Assuming equal height: multiplier = (new ÷ base)².',
    weightModalTitle: 'Multiplier from weight',
    weightBase: 'Base recipe weight',
    weightTarget: 'Target weight (g)',
    weightNote: 'Multiplier = target weight ÷ base recipe weight.',
    apply: 'Apply',
    weightUnknown: 'Fill in the ingredients first — the base recipe weight is unknown.',
    sizeHelperError: 'Enter both values as numbers.',

    extras: 'Extras',
    packagingCost: 'Packaging, € per cake',
    laborMinutes: 'Work time, minutes',
    marginPct: 'Margin, %',
    marginDefaultPlaceholder: 'default: {n}%',
    extrasHint: 'Packaging and labor are per whole cake, independent of size. The hourly rate is in Settings.',

    deleteCake: 'Delete cake',
    confirmDeleteCakeTitle: 'Delete this cake?',
    confirmDeleteCakeText: '“{name}” will be deleted permanently.',

    costTitle: 'Cost',
    rowIngredients: 'Ingredients',
    rowPackaging: 'Packaging',
    rowLabor: 'Labor ({n} min)',
    rowFullCost: 'Total cost',
    rowPrice: 'Suggested price',
    rowWeight: 'Weight',
    rowCostPerKg: 'Cost per kg',
    summaryNote: 'Price = cost + {n}% margin.',
    summaryNoMargin: 'No margin set — the suggested price equals the cost. Set a margin in Settings or in “Extras”.',
    weightApprox: 'Weight is approximate: fill in “Weight of 1 pc” for piece-counted ingredients.',
    saved: 'Saved',
    saveError: 'Could not save. Check your connection — your changes stay on screen.',
    loadError: 'Could not load your data. Check your internet and reload the page.',
    cdnError: 'Could not connect to the database. Check your internet and reload the page.',
    reload: 'Reload page',

    ingredientsTitle: 'Ingredients',
    newIngredient: 'New ingredient',
    ingName: 'Name',
    ingNamePlaceholder: 'E.g. “Wheat flour”',
    packQty: 'Pack size',
    packUnit: 'Unit',
    packPrice: 'Pack price, €',
    perUnit: 'per {unit}',
    editIngredient: 'Edit',
    emptyIngredientsTitle: 'No ingredients yet',
    emptyIngredientsText: 'Add the products you bake with: name, pack size and pack price. For example: flour — 1 kg — €1.20.',
    addIngredient: 'Add ingredient',
    saveIngredient: 'Save',
    confirmDeleteIngTitle: 'Delete ingredient?',
    confirmDeleteIngText: '“{name}” will be deleted.',
    confirmDeleteIngUsed: '“{name}” is used {usage}. It will be marked as deleted in those recipes.',
    usageIn: { one: 'in {n} recipe', many: 'in {n} recipes' },
    ingFormError: 'Please fill in the name, pack size and price.',
    gramsPerPiece: 'Weight of 1 pc, g',
    gramsPerPieceHint: 'Only used to estimate cake weight. E.g. one egg ≈ 55 g. Can be left empty.',
    gramsPerPieceError: 'Weight of 1 pc must be a number above zero — or leave it empty.',

    settingsTitle: 'Settings',
    languageBlock: 'Language',
    calcBlock: 'Calculations',
    laborRateLabel: 'Hourly labor rate, €',
    laborRateHint: 'Used when a recipe specifies work time.',
    defaultMarginLabel: 'Default margin, %',
    defaultMarginHint: 'Applied to all cakes without their own margin.',
    backupBlock: 'Backup',
    exportBtn: 'Download data backup',
    importBtn: 'Restore from file',
    backupHint: 'A file with a copy of all recipes and prices. Save it somewhere safe from time to time.',
    importConfirmTitle: 'Restore data?',
    importConfirmText: 'Current data will be replaced with the contents of “{name}”.',
    importDone: 'Data restored',
    importError: 'Could not read the file. Make sure it is a Konditer backup.',
    exportDone: 'Backup saved to downloads',
    accountBlock: 'Account',
    signedInAs: 'Signed in as {email}',
    signOut: 'Sign out',
    confirmSignOutTitle: 'Sign out?',
    confirmSignOutText: 'Your data stays in the cloud. You will need your password to sign in again.',
    localBanner: 'Local mode: data is stored only in this browser on this computer. Don’t clear browser data, and make backups.',

    authTitle: 'Welcome!',
    authSub: 'Sign in to open your recipes',
    email: 'Email',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    forgotPassword: 'Forgot password?',
    resetSentTitle: 'Email sent',
    resetSentText: 'Check {email} — it has a link to reset your password.',
    resetNeedEmail: 'Enter your email, then press “Forgot password?”',
    errInvalidCreds: 'Wrong email or password.',
    errTooMany: 'Too many attempts. Wait a moment and try again.',
    errNetwork: 'No internet connection. Check your network and try again.',
    errGeneric: 'Something went wrong. Please try again.',

    migrateTitle: 'Data found on this computer',
    migrateText: 'There are recipes saved in local mode. Move them into your cloud account?',
    migrateYes: 'Move data',
    migrateNo: 'Don’t move',
    migrateLater: 'Ask later',
    migrateDone: 'Data moved to the cloud',

    emojiPickerTitle: 'Cake icon',

    ariaMainNav: 'Main navigation',
    ariaLoading: 'Loading',

    cancel: 'Cancel',
    delete: 'Delete',
    close: 'Close',
    add: 'Add',
    sampleAdded: 'Example added',
  },
};

let lang = localStorage.getItem(LANG_KEY) || 'ru';
if (!dict[lang]) lang = 'ru';

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!dict[next]) return;
  lang = next;
  localStorage.setItem(LANG_KEY, next);
  document.documentElement.lang = next;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function t(key, vars) {
  const entry = dict[lang][key] ?? dict.ru[key] ?? key;
  if (typeof entry !== 'string') return key;
  return interpolate(entry, vars);
}

// Plural-aware translation. Entry must be {one, few?, many}.
export function tp(key, n, extraVars) {
  const entry = dict[lang][key] ?? dict.ru[key];
  if (!entry || typeof entry === 'string') return t(key, { n, ...extraVars });
  let form;
  if (lang === 'ru') {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) form = 'one';
    else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) form = 'few';
    else form = 'many';
    if (!entry[form]) form = 'many';
  } else {
    form = n === 1 ? 'one' : 'many';
    if (!entry[form]) form = 'one';
  }
  return interpolate(entry[form], { n, ...extraVars });
}
