// ============================================================
// store.js — data layer.
//
// Two backends behind one interface:
//   local — localStorage (no Firebase config present)
//   cloud — Firestore under users/{uid}/… with offline persistence
//
// Cloud writes are optimistic: local state changes and the UI updates
// immediately, and the Firestore promise is NOT awaited by callers —
// offline, those promises stay pending until connectivity returns.
// Failures surface through the onError callback.
// ============================================================

const LS_KEY = 'konditer-data-v1';
const FIREBASE_VER = '10.12.2';
const SOURCES = ['ingredients', 'recipes', 'settings'];

export const DEFAULT_SETTINGS = { laborRate: 0, marginPct: 0, currency: 'EUR' };

function emptyState() {
  return {
    ingredients: [],
    recipes: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
      recipes: Array.isArray(data.recipes) ? data.recipes : [],
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    };
  } catch {
    return null;
  }
}

function writeLocal(state) {
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({
      ingredients: state.ingredients,
      recipes: state.recipes,
      settings: state.settings,
    })
  );
}

export const Store = {
  mode: 'local',
  user: null,
  ready: false,
  fatalError: null, // 'cdn' | 'load' — shown as a full-screen message
  state: emptyState(),

  _cb: { onChange: () => {}, onAuthChange: () => {}, onError: () => {} },
  _fb: null, // { db, auth, fns } when in cloud mode
  _unsubs: [],
  _arrived: new Set(),

  async init(callbacks = {}) {
    Object.assign(this._cb, callbacks);

    if (window.FIREBASE_CONFIG) {
      this.mode = 'cloud';
      try {
        await this._initCloud();
      } catch (err) {
        console.error('Firebase init failed', err);
        this.fatalError = 'cdn';
        this.ready = true;
        this._cb.onChange();
      }
    } else {
      this.mode = 'local';
      this.state = readLocal() || emptyState();
      this.ready = true;
      this._cb.onChange();
    }
  },

  // ---------------- cloud ----------------

  async _initCloud() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}`;
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);

    const app = appMod.initializeApp(window.FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);

    let db;
    try {
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache(),
      });
    } catch {
      // persistence unavailable (e.g. private browsing) — fall back to memory cache
      db = fsMod.getFirestore(app);
    }

    this._fb = { app, auth, db, authMod, fsMod };

    await new Promise((resolve) => {
      let first = true;
      authMod.onAuthStateChanged(auth, (user) => {
        this.user = user || null;
        if (user) {
          // Not ready until this user's data has actually loaded — the
          // migration prompt must never see an empty state as "cloud is empty".
          this.ready = false;
          this.state = emptyState();
          this._subscribe(user.uid);
        } else {
          this._unsubscribeAll();
          this.state = emptyState();
          this.ready = true; // ready to show the sign-in screen
        }
        this._cb.onAuthChange(this.user);
        this._cb.onChange();
        if (first) {
          first = false;
          resolve();
        }
      });
    });
  },

  _subscribe(uid) {
    this._unsubscribeAll();
    const { db, fsMod } = this._fb;
    const { collection, doc, onSnapshot } = fsMod;

    this._arrived = new Set();
    const arrived = (source) => {
      this._arrived.add(source);
      // Every source must report once before the app is considered loaded,
      // including empty collections (onSnapshot fires with an empty snapshot).
      if (SOURCES.every((s) => this._arrived.has(s))) this.ready = true;
      this._cb.onChange();
    };

    const onErr = (source) => (err) => {
      console.error(`Firestore listener failed (${source})`, err);
      // Mark arrived so the UI leaves the spinner, and surface the failure.
      this.fatalError = 'load';
      arrived(source);
    };

    this._unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'ingredients'),
        (snap) => {
          this.state.ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          arrived('ingredients');
        },
        onErr('ingredients')
      )
    );
    this._unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'recipes'),
        (snap) => {
          this.state.recipes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          arrived('recipes');
        },
        onErr('recipes')
      )
    );
    this._unsubs.push(
      onSnapshot(
        doc(db, 'users', uid, 'meta', 'settings'),
        (snap) => {
          this.state.settings = { ...DEFAULT_SETTINGS, ...(snap.data() || {}) };
          arrived('settings');
        },
        onErr('settings')
      )
    );
  },

  _unsubscribeAll() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
    this._arrived = new Set();
  },

  // True only when every collection for this user has loaded at least once.
  isFullyLoaded() {
    if (this.mode !== 'cloud') return true;
    return SOURCES.every((s) => this._arrived.has(s));
  },

  // ---------------- auth ----------------

  async signIn(email, password) {
    const { auth, authMod } = this._fb;
    await authMod.signInWithEmailAndPassword(auth, email, password);
  },

  async signOut() {
    const { auth, authMod } = this._fb;
    await authMod.signOut(auth);
  },

  async resetPassword(email) {
    const { auth, authMod } = this._fb;
    await authMod.sendPasswordResetEmail(auth, email);
  },

  // ---------------- writes ----------------

  // Fire a Firestore write without blocking the UI. Offline, the promise
  // stays pending (the write is queued locally and syncs later), so awaiting
  // it would freeze the interface — exactly what offline mode must avoid.
  _fire(promise) {
    Promise.resolve(promise).catch((err) => {
      console.error('Firestore write failed', err);
      this._cb.onError('save', err);
    });
  },

  _persistLocal() {
    try {
      writeLocal(this.state);
    } catch (err) {
      console.error('localStorage write failed', err);
      this._cb.onError('save', err);
    }
  },

  _commit(cloudWrite) {
    if (this.mode === 'cloud' && this.user) this._fire(cloudWrite());
    else this._persistLocal();
    this._cb.onChange();
  },

  saveIngredient(ing) {
    const idx = this.state.ingredients.findIndex((i) => i.id === ing.id);
    if (idx >= 0) this.state.ingredients[idx] = ing;
    else this.state.ingredients.push(ing);
    this._commit(() => {
      const { db, fsMod } = this._fb;
      const { id, ...data } = ing;
      return fsMod.setDoc(fsMod.doc(db, 'users', this.user.uid, 'ingredients', id), data);
    });
  },

  deleteIngredient(id) {
    this.state.ingredients = this.state.ingredients.filter((i) => i.id !== id);
    this._commit(() => {
      const { db, fsMod } = this._fb;
      return fsMod.deleteDoc(fsMod.doc(db, 'users', this.user.uid, 'ingredients', id));
    });
  },

  saveRecipe(recipe) {
    const idx = this.state.recipes.findIndex((r) => r.id === recipe.id);
    if (idx >= 0) this.state.recipes[idx] = recipe;
    else this.state.recipes.push(recipe);
    this._commit(() => {
      const { db, fsMod } = this._fb;
      const { id, ...data } = recipe;
      return fsMod.setDoc(fsMod.doc(db, 'users', this.user.uid, 'recipes', id), data);
    });
  },

  deleteRecipe(id) {
    this.state.recipes = this.state.recipes.filter((r) => r.id !== id);
    this._commit(() => {
      const { db, fsMod } = this._fb;
      return fsMod.deleteDoc(fsMod.doc(db, 'users', this.user.uid, 'recipes', id));
    });
  },

  saveSettings(partial) {
    this.state.settings = { ...this.state.settings, ...partial };
    this._commit(() => {
      const { db, fsMod } = this._fb;
      return fsMod.setDoc(
        fsMod.doc(db, 'users', this.user.uid, 'meta', 'settings'),
        this.state.settings
      );
    });
  },

  // ---------------- backup ----------------

  exportData() {
    return {
      app: 'konditer',
      version: 1,
      exportedAt: new Date().toISOString(),
      ingredients: this.state.ingredients,
      recipes: this.state.recipes,
      settings: this.state.settings,
    };
  },

  validateImport(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.app !== 'konditer') return false;
    if (!Array.isArray(data.ingredients) || !Array.isArray(data.recipes)) return false;
    const validId = (r) =>
      r && typeof r === 'object' && typeof r.id === 'string' && r.id.trim() !== '' &&
      // Firestore document ids may not contain slashes.
      !r.id.includes('/');
    return data.ingredients.every(validId) && data.recipes.every(validId);
  },

  async importData(data) {
    const next = {
      ingredients: data.ingredients,
      recipes: data.recipes,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    };

    if (this.mode === 'cloud' && this.user) {
      await this._replaceCloudData(next);
    } else {
      this.state = next;
      this._persistLocal();
      this._cb.onChange();
    }
  },

  async _replaceCloudData(next) {
    const { db, fsMod } = this._fb;
    const uid = this.user.uid;
    const { writeBatch, doc } = fsMod;

    // Delete docs that are not present in the incoming data, then upsert all.
    const keepIng = new Set(next.ingredients.map((i) => i.id));
    const keepRec = new Set(next.recipes.map((r) => r.id));
    const ops = [];

    for (const i of this.state.ingredients) {
      if (!keepIng.has(i.id)) ops.push({ type: 'del', ref: doc(db, 'users', uid, 'ingredients', i.id) });
    }
    for (const r of this.state.recipes) {
      if (!keepRec.has(r.id)) ops.push({ type: 'del', ref: doc(db, 'users', uid, 'recipes', r.id) });
    }
    for (const i of next.ingredients) {
      const { id, ...data } = i;
      ops.push({ type: 'set', ref: doc(db, 'users', uid, 'ingredients', id), data });
    }
    for (const r of next.recipes) {
      const { id, ...data } = r;
      ops.push({ type: 'set', ref: doc(db, 'users', uid, 'recipes', id), data });
    }
    ops.push({ type: 'set', ref: doc(db, 'users', uid, 'meta', 'settings'), data: next.settings });

    // Firestore batches cap at 500 operations.
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        if (op.type === 'del') batch.delete(op.ref);
        else batch.set(op.ref, op.data);
      }
      // Offline this resolves only once synced; import is an explicit,
      // user-initiated action, so waiting (with a spinner) is acceptable.
      await batch.commit();
    }
  },

  // ---------------- local → cloud migration ----------------

  hasLocalData() {
    const local = readLocal();
    return !!local && (local.ingredients.length > 0 || local.recipes.length > 0);
  },

  cloudIsEmpty() {
    return this.state.ingredients.length === 0 && this.state.recipes.length === 0;
  },

  async migrateLocalToCloud() {
    const local = readLocal();
    if (!local) return;
    await this._replaceCloudData(local);
    localStorage.removeItem(LS_KEY);
  },

  // Only called on an explicit "don't move" — never on a dismissed dialog.
  dismissLocalData() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) localStorage.setItem(LS_KEY + '-archived', raw);
    localStorage.removeItem(LS_KEY);
  },
};
