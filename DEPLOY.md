# Running and deploying this thing

Written to be followed without knowing the code. Read part 1 once; after that
you'll only ever need parts 3, 5 and 6.

---

## 1. What the system is made of

Four separate pieces. They are deployed in different places and fail
independently, which is the main thing to understand.

```
   X (Twitter)                                Discord
       │                                          │
       │  worker holds an open connection         │  extension reads the tab
       ▼                                          ▼
  ┌──────────────┐                         ┌───────────────┐
  │ RENDER       │                         │ CHROME        │
  │ worker/      │                         │ EXTENSION     │
  │ index.js     │                         │ (client's PC) │
  └──────┬───────┘                         └───────┬───────┘
         │ writes tweets                           │
         ▼                                         │ sends straight into
  ┌──────────────┐                                 │ the page, no server
  │ FIREBASE     │                                 │
  │ (Firestore)  │                                 │
  └──────┬───────┘                                 │
         │ site reads live                         │
         ▼                                         ▼
  ┌──────────────────────────────────────────────────────┐
  │ VERCEL (the website)                                 │
  │   left column: X          right column: Discord      │
  └──────────────────────────────────────────────────────┘
```

**Firebase (Firestore)**. The shared database. Three collections:
`tweets` (captured posts), `followed_handles` (who to follow),
`stream_state/main` (a single on/off switch).

**Render**. An always-on Node service, the code in `worker/`. It watches the
on/off switch in Firestore. When you flip it to on, it opens a live connection
to X and writes every matching tweet into Firestore. This is the only piece
that talks to X, and the only piece that holds the X API key.

**Vercel**. The website (everything outside `worker/`). It holds no secrets and
talks to no API. It reads Firestore live and draws the left column.

**Chrome extension** (`DiscordExtension/`). Runs on your client's own
PC. It reads Discord messages out of the tabs he already has open and pushes
them straight into the right column of the website, inside his browser.

> **Discord never touches Firebase, Render, or Vercel.** There is no Discord
> server-side anything. That column is filled by his own machine, which is why
> it is empty on his phone and empty when his PC is off. This isn't a bug or
> something left unfinished. Discord has no feed a normal account can subscribe
> to, and the alternative (a bot on his user token) gets accounts banned.

---

## 2. Where every secret lives

| Secret | Lives in | Used by |
|---|---|---|
| `X_BEARER_TOKEN` | Render → Environment | the worker, to read X |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Render → Environment | the worker, to write Firestore |
| `FIREBASE_PROJECT_ID` | Render → Environment | the worker |
| Firebase web config | committed in `src/lib/firebase.ts` | the website |
| Site login | committed in `src/lib/auth.ts` | the website |

The Firebase web config being in the source is **fine and normal**. It
identifies the project, it doesn't grant access. The X token and the service
account are the real secrets, and both live only in Render's dashboard. Neither
is ever in GitHub.

**Vercel needs no environment variables at all.**

---

## 3. Deploying the change I just made

I changed the **website** and the **extension**. I did not touch `worker/`, so
**Render needs nothing**. Don't redeploy it, don't touch its settings.

### Step 1. Put your real domain in two files

The extension only injects itself into pages whose address it recognises. Right
now it recognises `localhost`, `*.lovable.app`, `*.lovableproject.com` and
`*.vercel.app`. If your site is on a plain `something.vercel.app` URL, skip to
Step 2, it already matches.

If you have a custom domain (say `feed.yourclient.com`), edit two files:

**`DiscordExtension/manifest.json`**. Find the `bridge.js` block and
add your domain to the list:

```json
{
  "matches": [
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://*.lovable.app/*",
    "https://*.lovableproject.com/*",
    "https://*.vercel.app/*",
    "https://feed.yourclient.com/*"
  ],
  "js": ["bridge.js"],
  "run_at": "document_start"
}
```

**`DiscordExtension/popup.js`**. Line near the top:

```js
const SITE_URL = "https://feed.yourclient.com";
```

Get these wrong and the site loads fine but the Discord column permanently says
"extension not detected". That's the single most likely thing to go wrong.

### Step 2. Push to GitHub

```bash
git add -A
```

```bash
git commit -m "Add Discord column, two-column feed"
```

```bash
git push
```

### Step 3. Vercel deploys itself

Vercel is watching your GitHub repo. Pushing is the deploy. Open your Vercel
dashboard, watch the build go green (about a minute), open the site.

You should see two columns. Left fills with tweets. Right says "Feed Reader
extension not detected", which is correct, because this browser doesn't have it yet.

If the build fails, read the error in Vercel's log. To reproduce it locally:

```bash
npm run build
```

### Step 4. Install the extension on your client's PC

This has to happen on the machine that will do the capturing. Send him the
`DiscordExtension` folder (zip it), and these instructions:

1. Unzip it somewhere permanent (**Documents, not Downloads**). If the folder
   moves or gets deleted, the extension dies.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**, top-right.
4. Click **Load unpacked**, select the `DiscordExtension` folder.
5. Open the Discord channels to follow, one tab each. **Reload any Discord tab
   that was already open**. Chrome only injects into tabs opened after the
   extension was loaded.
6. Open the feed site. The right column should now show a green dot instead of
   the yellow warning.

### Step 5. Check it actually works

- **Left column**: the **Resume** button in the X column header. The dot beside
  the heading turns green and starts pulsing. Posts arrive within a minute or two.
- **Right column**: post a message in one of the followed Discord channels. It
  should appear within a second.

Only messages that arrive **after** capture starts are captured. Scrolling up in
Discord to load old messages does nothing on purpose.

---

## 4. Day-to-day: what has to stay running

| For this to work | This must be true |
|---|---|
| X column | Render service is live. That's it. Works on his phone. |
| Discord column | His PC is on, Chrome is open, Discord tabs are open, the feed site is open in a tab |

The extension fights Chrome's background-tab throttling (it fakes the tab being
visible and plays an inaudible tone so Chrome won't freeze it), so the Discord
tabs can be behind other windows. But a sleeping laptop captures nothing.

If he closes the feed site tab, capture keeps running and the messages are held
on his disk. They reappear when he opens the site again.

---

## 5. Changing the X API key

The token lives in exactly one place: Render. Nothing else needs to change, and
you never redeploy the website for this.

### Get the new token

1. Go to <https://developer.x.com> → **Developer Portal** → **Projects & Apps**.
2. Click the app you're already using. **Use the same app, don't create a new
   one.** A new app can land on a plan without access to the live stream
   endpoint this worker needs, and then nothing works and it isn't obvious why.
3. **Keys and tokens** tab → **Bearer Token** → **Regenerate**.
4. Copy it now. X shows it once and never again.

Regenerating kills the old token immediately, so the feed stops until you finish
the next part. Do this outside market hours.

### Put it into Render

1. Go to <https://dashboard.render.com> → click your worker service.
2. **Environment** in the left sidebar.
3. Find `X_BEARER_TOKEN`, click edit, paste the new value, **Save Changes**.
4. Render restarts the service automatically. Wait for the status to say
   **Live** (about a minute).

### Confirm it worked

Click **Logs** in the sidebar. You want to see:

```
Worker started. Waiting for stream_state/main…
Stream connected with 1 rule group(s).
```

The worker remembers the on/off switch was on and reconnects by itself. If
tweets don't resume within a few minutes, open the site and press the X column's
header button twice (Pause, then Resume).

If the token is bad, the error shows up in a red box at the top of the X column
on the site itself, and in Render's logs.

---

## 6. When something is broken

**Right column says "extension not detected"**
The site's address isn't in `manifest.json`. Go back to part 3, step 1. After
editing, go to `chrome://extensions` and hit the reload icon on the extension,
then reload the site.

**Right column connects but no messages arrive**
Is capture paused? The header button should say "Pause" (meaning it's running),
not "Resume". Then: are the Discord tabs actually open, and were they reloaded
after the extension was installed?

**Discord stopped working after a Discord update**
The extension reads Discord's page structure, and Discord occasionally changes
it. The selectors are at the top of `content.js`. This is the known long-term
maintenance cost of doing Discord this way.

**Left column has no tweets**
In order: is Render **Live**? Is the dot in the X column header green? Does its
button say **Pause** (meaning running) rather than **Resume**? Are there handles
added under the **Accounts** dropdown? Is there a red error box at the top of the
column? Render's logs will say what X rejected.

**Render service is asleep**
The free tier sleeps, which permanently breaks the stream. This needs the paid
Starter instance.

**Is the worker alive?** Open your Render service's URL directly. It should say
`Tweet Stream Worker OK`. Add `/health` for a JSON status.

---

## 7. Known issues, deliberately left alone

Flagged and consciously deferred, not oversights.

**The site's login is cosmetic.** The username and password are in
`src/lib/auth.ts`, which ships to the browser. Anyone who opens developer tools
can read them, and the Firestore rules are open, so anyone with the URL can read
the whole feed and toggle the X stream on and off. Since each captured post
costs money, that means a stranger with your URL can spend your money. The fix
is Firebase anonymous auth plus real Firestore rules. Until then: **don't share
the URL, and don't let it get indexed.**

**Nothing is ever deleted from `tweets`.** It grows forever and Firestore bills
on storage. A TTL policy in the Firebase console solves it in a few clicks.
(The Discord side does self-limit. It keeps the newest 2000 on disk.)
