// Feed Reader. Popup: shows status + opens the feed.

// The deployed feed site. Change this if you move the site to another domain,
// and add the new domain to the bridge.js entry in manifest.json too, or the
// Discord column there will stay empty.
const SITE_URL = "http://localhost:8080";

const dot = document.getElementById("dot");
const label = document.getElementById("label");
const countEl = document.getElementById("count");
const openBtn = document.getElementById("open");
const siteBtn = document.getElementById("site");

siteBtn.onclick = () => {
  chrome.tabs.create({ url: SITE_URL });
};

openBtn.onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
};

function refresh() {
  chrome.runtime.sendMessage({ type: "get-status" }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    dot.classList.toggle("on", res.capturing);
    label.textContent = res.capturing ? "Capturing" : "Paused";
    countEl.textContent = res.count + (res.count === 1 ? " msg" : " msgs");
  });
}

refresh();
