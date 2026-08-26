// ============================================================
// store.js — data layer.
//
// Two backends behind one interface:
//   local — localStorage (no Firebase config present)
//   cloud — Firestore under users/{uid}/… with offline persistence
//
// Public surface:
//   Store.init(callbacks) → resolves when the first state is ready
//   Store.mode ('local' | 'cloud'), Store.user
//   Store.state = { ingredients: [], recipes: [], settings: {} }
//   Store.saveIngredient / deleteIngredient / saveRecipe / deleteRecipe
//   Store.saveSettings(partial)
//   Store.signIn(email, pass) / signOut() / resetPassword(email)
//   Store.exportData() / importData(obj)
//   Store.hasLocalData() / migrateLocalToCloud()
// ============================================================

const LS_KEY = 'konditer-data-v1';
const FIREBASE_VER = '10.12.2';

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
  state: emptyState(),

  _cb: { onChange: () => {}, onAuthChange: () => {} },
  _fb: null, // { db, auth, fns } when in cloud mode
  _unsubs: [],

  async init(callbacks = {}) {
    Object.assign(this._cb, callbacks);

    if (window.FIREBASE_CONFIG) {
      this.mode = 'cloud';
      await this._initCloud();
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
          this._subscribe(user.uid);
        } else {
          this._unsubscribeAll();
          this.state = emptyState();
          this.ready = true;
          this._cb.onChange();
        }
        this._cb.onAuthChange(this.user);
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

    let got = 0;
    const arrived = () => {
      got += 1;
      if (got >= 3) this.ready = true;
      this._cb.onChange();
    };

    this._unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'ingredients'), (snap) => {
        this.state.ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arrived();
      })
    );
    this._unsubs.push(
      onSnapshot(collection(db, 'users', uid, 'recipes'), (snap) => {
        this.state.recipes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        arrived();
      })
    );
    this._unsubs.push(
      onSnapshot(doc(db, 'users', uid, 'meta', 'settings'), (snap) => {
        this.state.settings = { ...DEFAULT_SETTINGS, ...(snap.data() || {}) };
        arrived();
      })
    );
  },

  _unsubscribeAll() {
    this._unsubs.forEach((u) => u());
    this._unsubs = [];
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

  _persistLocal() {
    writeLocal(this.state);
    this._cb.onChange();
  },

  async saveIngredient(ing) {
    const idx = this.state.ingredients.findIndex((i) => i.id === ing.id);
    if (idx >= 0) this.state.ingredients[idx] = ing;
    else this.state.ingredients.push(ing);

    if (this.mode === 'cloud' && this.user) {
      const { db, fsMod } = this._fb;
      const { id, ...data } = ing;
      this._cb.onChange();
      await fsMod.setDoc(fsMod.doc(db, 'users', this.user.uid, 'ingredients', id), data);
    } else {
      this._persistLocal();
    }
  },

  async deleteIngredient(id) {
    this.state.ingredients = this.state.ingredients.filter((i) => i.id !== id);
    if (this.mode === 'cloud' && this.user) {
      const { db, fsMod } = this._fb;
      this._cb.onChange();
      await fsMod.deleteDoc(fsMod.doc(db, 'users', this.user.uid, 'ingredients', id));
    } else {
      this._persistLocal();
    }
  },

  async saveRecipe(recipe) {
    const idx = this.state.recipes.findIndex((r) => r.id === recipe.id);
    if (idx >= 0) this.state.recipes[idx] = recipe;
    else this.state.recipes.push(recipe);

    if (this.mode === 'cloud' && this.user) {
      const { db, fsMod } = this._fb;
      const { id, ...data } = recipe;
      this._cb.onChange();
      await fsMod.setDoc(fsMod.doc(db, 'users', this.user.uid, 'recipes', id), data);
    } else {
      this._persistLocal();
    }
  },

  async deleteRecipe(id) {
    this.state.recipes = this.state.recipes.filter((r) => r.id !== id);
    if (this.mode === 'cloud' && this.user) {
      const { db, fsMod } = this._fb;
      this._cb.onChange();
      await fsMod.deleteDoc(fsMod.doc(db, 'users', this.user.uid, 'recipes', id));
    } else {
      this._persistLocal();
    }
  },

  async saveSettings(partial) {
    this.state.settings = { ...this.state.settings, ...partial };
    if (this.mode === 'cloud' && this.user) {
      const { db, fsMod } = this._fb;
      this._cb.onChange();
      await fsMod.setDoc(
        fsMod.doc(db, 'users', this.user.uid, 'meta', 'settings'),
        this.state.settings
      );
    } else {
      this._persistLocal();
    }
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
    return (
      data &&
      typeof data === 'object' &&
      data.app === 'konditer' &&
      Array.isArray(data.ingredients) &&
      Array.isArray(data.recipes)
    );
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

  dismissLocalData() {
    // User chose not to migrate; keep the backup under a parking key just in case.
    const raw = localStorage.getItem(LS_KEY);
    if (raw) localStorage.setItem(LS_KEY + '-archived', raw);
    localStorage.removeItem(LS_KEY);
  },
};
