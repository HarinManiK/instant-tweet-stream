// Feed Reader. Local viewer page logic.
// In its own file because MV3 extension pages forbid inline <script> (CSP: script-src 'self').
//
// This page is the local capture check: it proves the extension is capturing without
// needing the hosted site. The real two-column feed (X + Discord) is the hosted site,
// which receives these same messages through bridge.js.

const dot = document.getElementById("dot");
const count = document.getElementById("count");
const toggleBtn = document.getElementById("toggle");
const clearBtn = document.getElementById("clear");
const feed = document.getElementById("feed");

let capturing = true;
const renderedIds = new Set(); // dedupe rendering across reconnects

// ---- New-message sound ------------------------------------------------------
// Plays kaching.mp3 on every new message. Browser autoplay rules require one user
// gesture first, so we "arm" it on the first click in the viewer. A silent
// keepalive tone keeps this tab from being frozen by Chrome when it's in the
// background, so the sound still fires when the tab/browser isn't focused.
const ping = document.getElementById("ping");
const soundHint = document.getElementById("soundhint");
let soundArmed = false;
let keepCtx = null;

function startKeepAlive() {
  try {
    if (!keepCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      keepCtx = new AC();
      const osc = keepCtx.createOscillator();
      const gain = keepCtx.createGain();
      osc.frequency.value = 30; // inaudible on typical hardware, but keeps the tab "audible"
      gain.gain.value = 0.003;
      osc.connect(gain);
      gain.connect(keepCtx.destination);
      osc.start();
    }
    if (keepCtx.state === "suspended") keepCtx.resume().catch(() => {});
  } catch (e) {}
}

function armSound() {
  if (soundArmed) return;
  soundArmed = true;
  if (soundHint) soundHint.style.display = "none";
  startKeepAlive();
  setInterval(startKeepAlive, 15000);
  // Prime the audio element silently so later programmatic plays are allowed.
  try {
    ping.muted = true;
    ping.play().then(() => { ping.pause(); ping.currentTime = 0; ping.muted = false; }).catch(() => { ping.muted = false; });
  } catch (e) {}
}
// Only this button arms the sound, nothing else on the page.
if (soundHint) soundHint.addEventListener("click", armSound);

function playPing() {
  if (!soundArmed) return;
  try {
    ping.currentTime = 0;
    ping.play().catch(() => {});
  } catch (e) {}
}

function renderToggle() {
  toggleBtn.textContent = capturing ? "Stop" : "Start";
  toggleBtn.className = capturing ? "on" : "off";
}

function setCount() {
  const n = renderedIds.size;
  count.textContent = n + (n === 1 ? " message" : " messages");
}

function ensureEmptyGone() {
  const empty = document.getElementById("empty");
  if (empty) empty.remove();
}

function showEmpty() {
  feed.innerHTML = "";
  const el = document.createElement("div");
  el.className = "empty";
  el.id = "empty";
  el.textContent = "Waiting for Discord messages…";
  feed.appendChild(el);
}

// A small "×" delete button in the top-right of every card. Removes the card and
// deletes the item from the on-device store so it doesn't return on reload.
function addDeleteButton(el, m) {
  const btn = document.createElement("button");
  btn.className = "del-btn";
  btn.title = "Remove";
  btn.textContent = "×";
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't trigger the card's open/focus click
    el.remove();
    renderedIds.delete(m.id);
    if (renderedIds.size === 0) showEmpty();
    setCount();
    try {
      chrome.runtime.sendMessage({ type: "delete", id: m.id });
    } catch (e) {}
  });
  el.appendChild(btn);
}

function buildDiscordCard(m) {
  const el = document.createElement("div");
  el.className = "msg";

  const loc = document.createElement("div");
  loc.className = "loc";
  loc.textContent = (m.server || "unknown") + "/#" + (m.channel || "unknown");
  el.appendChild(loc);

  if (m.replyToAuthor) {
    const reply = document.createElement("div");
    reply.className = "reply";
    reply.textContent = "(reply to " + m.replyToAuthor + ": " + (m.replyToSnippet || "") + ")";
    el.appendChild(reply);
  }

  const top = document.createElement("div");
  top.className = "top";
  const author = document.createElement("span");
  author.className = "author";
  author.textContent = m.author || "unknown";
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = m.timestamp ? new Date(m.timestamp).toLocaleString() : "";
  top.appendChild(author);
  top.appendChild(time);
  el.appendChild(top);

  const content = document.createElement("div");
  content.className = "content";
  content.textContent = m.content || "";
  el.appendChild(content);

  // Click a Discord message to focus the tab/window that already has that channel open.
  if (m.channelUrl) {
    const deep = m.channelUrl.replace(/\/+$/, "") + "/" + m.id;
    let path = deep;
    try { path = new URL(m.channelUrl).pathname; } catch (e) {}
    el.classList.add("clickable");
    el.title = "Go to this channel's Discord tab";
    el.addEventListener("click", () => {
      chrome.tabs.query({ url: ["*://discord.com/*", "*://*.discord.com/*"] }, (tabs) => {
        const match = tabs && tabs.find((t) => t.url && t.url.indexOf(path) !== -1);
        if (match) {
          chrome.tabs.update(match.id, { active: true });
          chrome.windows.update(match.windowId, { focused: true });
        } else {
          window.open(deep, "_blank");
        }
      });
    });
  }

  addDeleteButton(el, m);
  return el;
}

function renderMessage(m, scroll) {
  if (!m || !m.id || renderedIds.has(m.id)) return false;
  renderedIds.add(m.id);
  // Only auto-scroll if you're already near the bottom. If you've scrolled up to
  // read, a new message won't yank you back down. (Measure before appending.)
  const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  ensureEmptyGone();
  feed.appendChild(buildDiscordCard(m));
  setCount();
  if (scroll && nearBottom) feed.scrollTop = feed.scrollHeight;
  return true;
}

// Additive: never wipe the feed. The background worker gets recycled by Chrome and
// the viewer reconnects (re-sending history) periodically; renderMessage dedupes by
// id, so re-sent history is a no-op. Only genuinely new items are added.
function renderHistory(messages) {
  const wasEmpty = renderedIds.size === 0;
  if (messages && messages.length) messages.forEach((m) => renderMessage(m, false));
  if (renderedIds.size === 0 && !document.getElementById("empty")) showEmpty();
  setCount();
  if (wasEmpty) feed.scrollTop = feed.scrollHeight;
}

function clearAll() {
  renderedIds.clear();
  showEmpty();
  setCount();
}

// ---- Controls (one-off messages to the background worker) -------------------
toggleBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "set-capturing", value: !capturing });
};
clearBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "clear" });
};

// ---- Live connection to the background worker -------------------------------
let port = null;
function connect() {
  try {
    port = chrome.runtime.connect({ name: "viewer" });
  } catch (e) {
    dot.classList.remove("live");
    setTimeout(connect, 1000);
    return;
  }
  dot.classList.add("live");

  port.onMessage.addListener((m) => {
    if (!m || !m.type) return;
    if (m.type === "history") renderHistory(m.messages);
    else if (m.type === "message") {
      if (renderMessage(m.message, true)) playPing();
    } else if (m.type === "state") {
      capturing = m.capturing;
      renderToggle();
    } else if (m.type === "clear") {
      clearAll();
    } else if (m.type === "deleted") {
      renderedIds.delete(m.id);
      setCount();
    }
  });

  port.onDisconnect.addListener(() => {
    dot.classList.remove("live");
    setTimeout(connect, 1000); // background recycled (reconnect and re-sync)
  });
}

renderToggle();
connect();
