# Konditer — deployment & setup guide

The app is a static site (no build step) with two modes:

- **Local mode** — works immediately, data stays in the browser. Good for trying it out.
- **Cloud mode** — data lives in Firebase (free), protected by a login, synced and safe
  even if the computer breaks. **This is the mode your mother should use.**

Switching to cloud mode = doing Part 1 below and pasting six values into one file.

---

## Part 1 — Firebase (~10 minutes, free, no credit card)

### 1. Create the project
1. Go to <https://console.firebase.google.com> and sign in with any Google account
   (yours — your mother doesn't need it; she only gets an app login).
2. **Add project** → name it e.g. `konditer` → Google Analytics **off** → Create.

### 2. Register the web app & get the config
1. On the project overview page press the **`</>` (Web)** icon.
2. Nickname: `konditer-web`. Do **not** tick Firebase Hosting. → Register app.
3. It shows a `firebaseConfig = { ... }` block. Copy the six values into
   [`js/firebase-config.js`](js/firebase-config.js) replacing `null`:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   These values are safe to publish — security comes from the login + rules below.

### 3. Enable email/password sign-in and create her account
1. Left menu → **Build → Authentication** → Get started.
2. **Sign-in method** → Email/Password → Enable → Save.
3. **Users** tab → **Add user** → her email + a password you choose together.
   (She can later change it herself via "Забыли пароль?" on the login screen.)

### 4. Create the database
1. Left menu → **Build → Firestore Database** → Create database.
2. Location: pick the region closest to her (e.g. `europe-west3` for Germany).
   **Start in production mode** → Create.
3. Open the **Rules** tab and replace everything with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   → **Publish**. This means: each signed-in user can touch only their own data;
   everyone else — nothing.

### 5. Allow the site to sign in
1. **Authentication → Settings → Authorized domains**.
2. `localhost` is already there; after Part 2 add your GitHub Pages domain
   (e.g. `yourname.github.io`).

Done. Open the app → it now shows the login screen instead of local mode.
On first sign-in, if recipes were already created in local mode, the app offers
to move them into the cloud automatically.

---

## Part 2 — Hosting on GitHub Pages (~5 minutes, free)

1. Create a repository on <https://github.com/new> — e.g. `konditer`, **Public**
   (required for free Pages). Don't add a README.
2. From this `app/` folder:

   ```bash
   git remote add origin https://github.com/YOURNAME/konditer.git
   git push -u origin main
   ```
3. On GitHub: repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch `main`, folder `/ (root)` → Save.
4. After ~1 minute the app is live at `https://yourname.github.io/konditer/`.
5. Go back to Firebase **Authentication → Settings → Authorized domains** and add
   `yourname.github.io`.

Updating the app later = commit + push; the site refreshes itself.

---

## Part 3 — On her Mac (2 minutes)

1. Open the site in **Safari**.
2. Menu **File → Add to Dock** (macOS Sonoma or newer; on older macOS use
   **File → Add to Home Screen** equivalent or just bookmark it).
3. The app now sits in her Dock with its own icon and opens in its own window,
   like a normal Mac app. She signs in once; the session persists.

Works offline too: thanks to Firestore's offline cache she can open it without
internet and everything syncs when the connection returns.

---

## Safety notes

- **Backups**: Настройки → «Скачать копию данных» produces a JSON file with all
  recipes and prices. Do it occasionally; «Восстановить из файла» brings it back.
- **Costs**: the Firebase free tier (Spark) includes 1 GiB storage and 50k reads/day —
  a bakery's recipe book uses a fraction of a percent of that. No card on file,
  so it cannot silently start charging.
- **Password reset**: the login screen has «Забыли пароль?» which emails her a
  reset link — nothing for you to administer.
