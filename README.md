# Instant Feed

A live two-column feed for day trading: **X posts on the left, Discord messages
on the right**, in one page, with a sound on every new item.

**[→ Full setup, deployment and maintenance guide: DEPLOY.md](./DEPLOY.md)**

---

## The two halves work completely differently

This is the one thing to understand before reading any code.

**X is server-side.** A worker on Render holds an open X filtered-stream
connection and writes matching posts into Firestore. The website just reads
Firestore. It runs whether or not your computer is on, so the left column works
anywhere, including on a phone.

**Discord is device-local.** Discord has no live feed a normal user account can
subscribe to — a bot needs each server's admin to invite it, and a self-bot on
your own user token is a ToS violation that gets accounts banned. So Discord is
captured by a Chrome extension that reads messages out of the tabs you already
have open, stores them in IndexedDB, and hands them to the page inside your own
browser. **No Discord data ever reaches Firestore, Render or Vercel.**

The consequence: the Discord column only fills in on a machine running the
extension, with Chrome open. That is inherent to the approach, not a limitation
waiting to be fixed.

```
   X ──▶ Render worker ──▶ Firestore ──▶ ┌──────────────────┐
                                         │  Vercel website  │
   Discord ──▶ Chrome extension ────────▶└──────────────────┘
                (never leaves the device)
```

## Layout

| Path | What it is | Deployed to |
|---|---|---|
| `src/` | The website (TanStack Start + React + Tailwind) | Vercel |
| `worker/` | Always-on X stream reader | Render |
| `DiscordExtension/` | Chrome extension (Manifest V3) | Installed by hand |

## Run it locally

```bash
npm install
```

```bash
npm run dev
```

The site comes up on <http://localhost:8080>. The extension already recognises
`localhost`, so a locally-loaded extension will fill the Discord column in dev.

## Firestore collections

| Collection | Holds |
|---|---|
| `tweets` | Captured posts, newest read first |
| `followed_handles` | Accounts to follow, one doc per handle |
| `stream_state/main` | A single doc: the stream's on/off switch |

The Firebase web config in `src/lib/firebase.ts` is committed on purpose — it
identifies the project, it doesn't grant access. The real secrets (the X bearer
token and the Firebase service account) live only in Render's environment.

## Known issues

Documented in full in [DEPLOY.md](./DEPLOY.md) part 7. In short: the site's login
is cosmetic (credentials ship to the browser and the Firestore rules are open),
and the `tweets` collection is never pruned.
