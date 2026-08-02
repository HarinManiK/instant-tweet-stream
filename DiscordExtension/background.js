// Feed Reader. Background service worker.
// -----------------------------------------------------------------------------
// The single source of truth on this device. It:
//   1. Receives captured messages from Discord content scripts.
//   2. Stores them in IndexedDB (on-disk, survives restarts). This is "history".
//   3. Streams history + live messages to any connected viewer: the extension's
//      own viewer page, and the hosted feed site via bridge.js.
//
// Nothing here ever leaves the device. There is no network call, no server. The
// hosted site receives messages through the extension in this same browser; its
// server never sees them.
// -----------------------------------------------------------------------------

const DB_NAME = "reader";
const DB_VERSION = 1;
const STORE = "messages";
const DISCORD_EPOCH = 1420070400000; // 2015-01-01

// Cap on stored history. Trading channels are chatty; without a cap IndexedDB
// grows forever and every page load ships a bigger and bigger history payload.
const MAX_STORED = 2000;

// When you send a message, Discord renders it twice (an instant optimistic copy,
// then the confirmed copy once the server acknowledges it). Those two copies have
// DIFFERENT ids but identical author/content, so id-dedup alone lets both through.
// We also skip a message whose (server, channel, author, content) matches one seen
// within ECHO_WINDOW_MS. The optimistic/confirmed pair is well under a second apart,
// so this catches the echo. (Trade-off: the exact same text sent twice by the same
// person in the same channel within this window is treated as one.)
const ECHO_WINDOW_MS = 15000;
const recentSignatures = new Map(); // signature -> last-seen timestamp (in memory)

// ---- IndexedDB helpers ------------------------------------------------------

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("ts", "ts");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(mode) {
  return openDB().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function messageTimeMs(id) {
  try {
    return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
  } catch (e) {
    return NaN;
  }
}

function hasMessage(id) {
  return store("readonly").then(
    (s) =>
      new Promise((res) => {
        const r = s.get(id);
        r.onsuccess = () => res(!!r.result);
        r.onerror = () => res(false);
      })
  );
}

function addMessage(rec) {
  return store("readwrite").then(
    (s) =>
      new Promise((res) => {
        const r = s.add(rec);
        r.onsuccess = () => res(true);
        r.onerror = () => res(false); // duplicate key or other write error
      })
  );
}

function getAll() {
  return store("readonly").then(
    (s) =>
      new Promise((res) => {
        const r = s.getAll();
        r.onsuccess = () => {
          const list = r.result || [];
          // Chronological across every server/channel: Discord snowflake time is globally meaningful.
          list.sort(
            (a, b) => (a.ts || 0) - (b.ts || 0) || (a.capturedAt || 0) - (b.capturedAt || 0)
          );
          res(list);
        };
        r.onerror = () => res([]);
      })
  );
}

function clearAll() {
  return store("readwrite").then(
    (s) =>
      new Promise((res) => {
        const r = s.clear();
        r.onsuccess = () => res(true);
        r.onerror = () => res(false);
      })
  );
}

function count() {
  return store("readonly").then(
    (s) =>
      new Promise((res) => {
        const r = s.count();
        r.onsuccess = () => res(r.result || 0);
        r.onerror = () => res(0);
      })
  );
}

function deleteMessage(id) {
  return store("readwrite").then(
    (s) =>
      new Promise((res) => {
        const r = s.delete(id);
        r.onsuccess = () => res(true);
        r.onerror = () => res(false);
      })
  );
}

// Drop the oldest records once history exceeds MAX_STORED. Runs opportunistically
// after a write, never in the capture path's critical section.
let pruning = false;
async function pruneIfNeeded() {
  if (pruning) return;
  const n = await count();
  if (n <= MAX_STORED) return;
  pruning = true;
  try {
    const all = await getAll(); // oldest first
    const excess = all.slice(0, n - MAX_STORED);
    for (const rec of excess) await deleteMessage(rec.id);
  } finally {
    pruning = false;
  }
}

// ---- Capturing on/off (persisted) -------------------------------------------

function isCapturing() {
  return chrome.storage.local.get({ capturing: true }).then((v) => v.capturing);
}

// ---- Connected viewers (extension viewer page and/or the hosted site) --------

const viewers = new Set();

function broadcast(payload) {
  for (const port of viewers) {
    try {
      port.postMessage(payload);
    } catch (e) {
      viewers.delete(port);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "viewer") return;
  viewers.add(port);
  port.onDisconnect.addListener(() => viewers.delete(port));

  // Hand a freshly connected viewer the full history + current capturing state.
  Promise.all([getAll(), isCapturing()]).then(([messages, capturing]) => {
    try {
      port.postMessage({ type: "state", capturing });
      port.postMessage({ type: "history", messages });
    } catch (e) {
      viewers.delete(port);
    }
  });

  // Viewers may also drive controls over the port.
  port.onMessage.addListener(async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "clear") {
      await clearAll();
      broadcast({ type: "clear" });
    } else if (msg.type === "set-capturing") {
      await chrome.storage.local.set({ capturing: !!msg.value });
      broadcast({ type: "state", capturing: !!msg.value });
    } else if (msg.type === "delete") {
      if (msg.id) await deleteMessage(msg.id);
      broadcast({ type: "deleted", id: msg.id });
    }
  });
});

// ---- One-off messages (content scripts + popup) -----------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg || !msg.type) {
      sendResponse({ ok: false });
      return;
    }

    if (msg.type === "capture") {
      // Capture runs whenever capturing is on, whether or not a viewer is open.
      // Messages land in IndexedDB and are replayed as history next time the feed
      // page connects, so closing the feed tab doesn't punch a hole in the record.
      if (!(await isCapturing())) {
        sendResponse({ stored: false, reason: "paused" });
        return;
      }
      const p = msg.payload;
      if (!p || !p.id) {
        sendResponse({ stored: false, reason: "invalid" });
        return;
      }
      if (await hasMessage(p.id)) {
        sendResponse({ stored: false, reason: "duplicate" });
        return;
      }
      // Drop Discord's optimistic/confirmed echo of the same text (see ECHO_WINDOW_MS).
      const sig = [p.server, p.channel, p.author, p.content].join("0000");
      const now = Date.now();
      const prev = recentSignatures.get(sig);
      if (prev && now - prev < ECHO_WINDOW_MS) {
        recentSignatures.set(sig, now);
        sendResponse({ stored: false, reason: "echo" });
        return;
      }
      recentSignatures.set(sig, now);
      if (recentSignatures.size > 500) {
        for (const [k, t] of recentSignatures) {
          if (now - t > ECHO_WINDOW_MS) recentSignatures.delete(k);
        }
      }
      const rec = {
        ...p,
        source: "discord",
        ts: messageTimeMs(p.id) || Date.parse(p.timestamp) || Date.now(),
        capturedAt: Date.now(),
      };
      const ok = await addMessage(rec);
      if (ok) {
        broadcast({ type: "message", message: rec });
        pruneIfNeeded();
      }
      sendResponse({ stored: ok });
      return;
    }

    if (msg.type === "get-status") {
      sendResponse({ capturing: await isCapturing(), count: await count() });
      return;
    }

    if (msg.type === "set-capturing") {
      await chrome.storage.local.set({ capturing: !!msg.value });
      broadcast({ type: "state", capturing: !!msg.value });
      sendResponse({ capturing: !!msg.value });
      return;
    }

    if (msg.type === "clear") {
      await clearAll();
      broadcast({ type: "clear" });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "delete") {
      if (msg.id) await deleteMessage(msg.id);
      broadcast({ type: "deleted", id: msg.id });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, reason: "unknown-type" });
  })();

  return true; // keep the message channel open for the async sendResponse above
});

// ---- Keep Discord capture tabs from being auto-discarded (unloaded) by Chrome -

const KEEP_AWAKE_URLS = ["*://discord.com/*", "*://*.discord.com/*"];

function isCaptureTab(url) {
  return !!url && /(^|\.)discord\.com/.test(url);
}

function keepCaptureTabsAwake() {
  chrome.tabs.query({ url: KEEP_AWAKE_URLS }, (tabs) => {
    if (chrome.runtime.lastError || !tabs) return;
    for (const t of tabs) {
      try {
        chrome.tabs.update(t.id, { autoDiscardable: false });
      } catch (e) {}
    }
  });
}

chrome.runtime.onInstalled.addListener(keepCaptureTabsAwake);
chrome.runtime.onStartup.addListener(keepCaptureTabsAwake);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab && isCaptureTab(tab.url)) {
    try {
      chrome.tabs.update(tabId, { autoDiscardable: false });
    } catch (e) {}
  }
});
keepCaptureTabsAwake();
