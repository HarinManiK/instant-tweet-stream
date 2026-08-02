# Feed Reader, a Chrome extension

Captures new Discord messages the instant they render, stores them **on your own
device**, and streams them into the Discord column of the hosted feed site. No
server, no data collection. The messages never leave your browser.

This is a real Chrome extension (Manifest V3). The **capturing logic is the same
one that has always worked** — snowflake time-filtering so only new messages
count, exact-id lookups so replies don't grab the wrong text, emoji/sticker/GIF/
image handling, single-page-app re-binding.

## Why Discord works this way and X doesn't

The X half of the feed is server-side: a worker holds an X filtered-stream
connection and writes to Firestore, so it runs whether or not your machine is on.

Discord has no equivalent a normal user account can subscribe to. A bot needs
each server's admin to invite it, and a self-bot on your own user token is a ToS
violation that gets accounts banned. So Discord is captured from the DOM of the
tabs you already have open, on your machine. **That means the Discord column only
fills in on the machine running this extension**, and only while Chrome is open.

## How it works

```
  Discord tab(s)          Extension                       Hosted feed site
  ─────────────           ─────────                       ────────────────
  content.js  ──capture──▶  background.js  ──history+live──▶  bridge.js ──▶ Discord column
  (reads new                stores in IndexedDB              (relays into the page;
   messages)                on THIS device                    your server never sees it)
```

- **content.js**. Injected into `discord.com/channels/*`. Watches the message
  list and captures each new message by its exact id.
- **background.js**. Stores every captured message in IndexedDB (survives browser
  restarts = your "history"), dedupes id-wise and against Discord's optimistic/
  confirmed echo, prunes past 2000 messages, and streams to any connected viewer.
  Capture keeps running whether or not the feed site is open, so closing that tab
  doesn't punch a hole in the record.
- **bridge.js**. Relays the background worker into the hosted site over
  `window.postMessage`. The protocol is documented at the top of that file.
- **viewer.html**. A local capture check — proves capture works without the site.
- **popup**. Status, open the live feed, open the local check.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `DiscordExtension` folder.
4. **Reload any Discord tabs you already had open.** Chrome only injects the
   content script into tabs opened/reloaded *after* the extension is loaded.

## Point it at your deployed site

Two places need your production domain:

1. `manifest.json` → the `bridge.js` entry under `content_scripts` → `matches`.
   It currently ships with `localhost`, `127.0.0.1`, `*.lovable.app`,
   `*.lovableproject.com` and `*.vercel.app`. Add your custom domain there.
2. `popup.js` → `SITE_URL`, so the popup's **Open live feed** button goes to it.

Reload the extension at `chrome://extensions` after editing either file.

## Use it

1. Open the Discord channels you want to capture. **Keep the tabs/windows open.**
2. Open the feed site. Its Discord column fills with your history and then
   streams live.
3. Pause/Clear from the Discord column header, or from the popup.

Only messages that arrive **after** you start are captured. Old scrolled-back
history is deliberately ignored.

## Notes / limits

- **Discord only renders visible tabs.** `page-spoof.js` fights this: it forces
  `document.hidden`/`visibilityState` to report visible, swallows the
  `visibilitychange`/`blur` events Discord listens for, and plays an inaudible
  30 Hz tone so Chrome marks the tab audible and won't freeze it. That covers
  backgrounded tabs well, but a machine that is asleep captures nothing.
- **Selectors can drift.** If Discord changes its DOM, the selectors in
  `content.js` may need updating.
- **All local.** The extension requests no network/host permissions. Nothing is
  ever sent anywhere; `unlimitedStorage` just lets history grow without a small cap.
