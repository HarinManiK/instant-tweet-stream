// Feed Reader. Content script.
// -----------------------------------------------------------------------------
// Runs inside every open Discord channel tab. Captures each NEW message the
// instant it renders and hands it to the extension's background service worker,
// which stores it on this device (IndexedDB) and streams it to the viewer.
//
// The CAPTURING LOGIC below is intentionally kept identical to the original
// Tampermonkey userscript (discord-capturer.user.js). The ONLY change is the
// transport: instead of GM_xmlhttpRequest POSTing to a server, we call
// chrome.runtime.sendMessage(...) and the background worker takes it from there.
//
// WHY the background worker does the delivery (and not this script):
//   A content script's own network calls are still governed by discord.com's
//   Content-Security-Policy. The background service worker runs in the
//   extension's own origin and is not, which is the extension-native equivalent
//   of why the userscript needed GM_xmlhttpRequest.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // Selectors (Discord's data-/id attributes are more stable than its obfuscated class names).
  const LIST_SELECTOR = 'ol[data-list-id="chat-messages"]';
  const MSG_SELECTOR = 'li[id^="chat-messages-"]';

  const seen = new Set();  // dedupe by message id (observer re-fires on scroll/virtualization)
  let lastSeenAuthor = ""; // last resort if we somehow can't resolve the author
  let observer = null;

  // Only capture messages that actually ARRIVED after the capturer started, not old messages that
  // merely get re-drawn when you switch channels or scroll up. A Discord message id is a "snowflake"
  // whose high bits encode its creation time, so we can tell a message's true age from its id alone.
  const START_TIME = Date.now() - 5000; // 5s grace for clock skew / the 1s bind poll
  const DISCORD_EPOCH = 1420070400000;  // 2015-01-01, Discord's snowflake epoch
  function messageTimeMs(id) {
    try {
      return Number(BigInt(id) >> 22n) + DISCORD_EPOCH;
    } catch (e) {
      return NaN;
    }
  }

  function log(...args) {
    console.log("%c[Reader]", "color:#5865f2;font-weight:bold", ...args);
  }

  /** Pull the message id out of the <li id="chat-messages-<channel>-<message>">. */
  function parseMessageId(li) {
    const raw = li.id || "";
    const parts = raw.split("-");
    return parts.length ? parts[parts.length - 1] : raw;
  }

  /**
   * Which server + channel are we viewing? Read from the tab title, which Discord sets to
   * "(3979) Discord | #general | GH"  ->  (unread) Discord | #channel | Server.
   * We drop the "(unread)" count and the leading "Discord | ", then split "#channel | Server".
   */
  function getContext() {
    const parts = location.pathname.split("/").filter(Boolean); // ["channels", guildId, channelId]
    const guildId = parts[1] || "";
    const channelId = parts[2] || "";

    let server = "";
    let channel = "";

    let t = document.title
      .replace(/^\(\d+\)\s*/, "")      // drop "(3979) "
      .replace(/^Discord\s*\|\s*/, "") // drop leading "Discord | "
      .trim();                         // -> "#general | GH"  (or "@user" for a DM)

    const sep = t.indexOf(" | ");
    if (sep !== -1) {
      channel = t.slice(0, sep).replace(/^#/, "").trim();
      server = t.slice(sep + 3).trim();
    } else if (t) {
      channel = t.replace(/^[#@]/, "").trim();
    }

    if (!server) server = guildId === "@me" ? "Direct Messages" : guildId || "unknown";
    if (!channel) channel = channelId || "unknown";

    return { server, channel };
  }

  /**
   * Read the visible text of an element, turning emoji <img>s into their alt/name so emoji-only
   * messages aren't blank (plain .innerText drops <img> emojis).
   */
  function readText(el) {
    if (!el) return "";
    let out = "";
    el.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        out += node.textContent; // text node
      } else if (node.nodeType === 1) {
        if (node.tagName === "IMG") {
          out += node.getAttribute("alt") || node.getAttribute("data-name") || "";
        } else {
          out += readText(node); // recurse into spans etc.
        }
      }
    });
    return out;
  }

  /** The message author, by exact id, falling back to the group leader for grouped/compact messages. */
  function extractAuthor(li, id) {
    let el = document.getElementById("message-username-" + id);
    if (el) return el.textContent.trim();
    // Grouped messages have no header of their own; the article points at the group leader's name id.
    const article = li.querySelector('[role="article"]');
    const labelledby = article ? article.getAttribute("aria-labelledby") || "" : "";
    const m = labelledby.match(/message-username-(\d+)/);
    if (m) {
      el = document.getElementById("message-username-" + m[1]);
      if (el) return el.textContent.trim();
    }
    return lastSeenAuthor || "unknown";
  }

  /** If this message is a reply, return { author, snippet } of the message it replied to. */
  function extractReply(id) {
    const ctx = document.getElementById("message-reply-context-" + id);
    if (!ctx) return { author: "", snippet: "" };
    const authorEl = ctx.querySelector('[class*="username"]');
    const snippetEl = ctx.querySelector('[class*="repliedTextContent"]');
    return {
      author: authorEl ? authorEl.textContent.trim() : "",
      snippet: snippetEl ? readText(snippetEl).trim() : "",
    };
  }

  /** Describe non-text content (stickers, GIFs, image attachments) attached to the message. */
  function extractMedia(id) {
    const acc = document.getElementById("message-accessories-" + id);
    if (!acc) return "";
    const bits = [];

    acc.querySelectorAll('[data-type="sticker"]').forEach((s) => {
      bits.push("[Sticker: " + (s.getAttribute("data-name") || "unknown") + "]");
    });

    const gif = acc.querySelector('video[aria-label="GIF"]');
    if (gif) bits.push("[GIF: " + (gif.getAttribute("src") || "") + "]");
    else if (acc.querySelector('[class*="gifTag"]')) bits.push("[GIF]");

    acc
      .querySelectorAll(
        'img[src*="cdn.discordapp.com/attachments"], img[src*="media.discordapp.net/attachments"]'
      )
      .forEach((img) => bits.push("[Image: " + img.src + "]"));

    // Something is attached but we didn't recognise it (at least don't drop the message silently).
    if (bits.length === 0 && acc.children.length > 0) bits.push("[media]");

    return bits.join(" ");
  }

  /** Extract a captured message from a <li>, or null if there's nothing capturable. */
  function extract(li) {
    const id = parseMessageId(li);
    if (!id) return null;

    // Skip messages created before we started watching (rendered history, not a fresh arrival).
    const createdMs = messageTimeMs(id);
    if (createdMs && createdMs < START_TIME) return null;

    // THIS message's own content, by exact id (a reply embeds the quoted message under a different id).
    const contentEl = document.getElementById("message-content-" + id);
    let content = contentEl ? readText(contentEl).trim() : "";

    // Fold in stickers / GIFs / images so non-text messages aren't dropped.
    const media = extractMedia(id);
    if (media) content = content ? content + " " + media : media;

    if (!content) return null; // system message / divider / nothing to capture.

    const author = extractAuthor(li, id);
    if (author && author !== "unknown") lastSeenAuthor = author;

    const timeEl =
      document.getElementById("message-timestamp-" + id) || li.querySelector("time[datetime]");
    const timestamp = timeEl ? timeEl.getAttribute("datetime") : new Date().toISOString();

    const { server, channel } = getContext();
    const reply = extractReply(id);

    return {
      id,
      author,
      content,
      timestamp,
      server,
      channel,
      replyToAuthor: reply.author,
      replyToSnippet: reply.snippet,
      channelUrl: location.href,
    };
  }

  /** Hand one captured message to the background worker (which stores + streams it). */
  function send(msg) {
    try {
      chrome.runtime.sendMessage({ type: "capture", payload: msg }).catch(() => {
        // Background asleep/reloading. The message is already deduped locally, nothing else to do.
      });
    } catch (e) {
      // Extension context invalidated (e.g. extension was just reloaded). Reload the Discord tab.
    }
  }

  /** Handle one message node: dedupe, extract, send. */
  function process(li) {
    const id = parseMessageId(li);
    if (!id || seen.has(id)) return;
    const msg = extract(li);
    if (!msg) return;
    seen.add(id);
    send(msg);
    log("captured:", msg.author + ":", msg.content.slice(0, 80));
  }

  /** Start observing a given message list for inserted messages. */
  function observe(list) {
    if (observer) observer.disconnect();

    // Prime dedupe with everything already on screen so we don't re-send history.
    list.querySelectorAll(MSG_SELECTOR).forEach((li) => seen.add(parseMessageId(li)));

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(MSG_SELECTOR)) {
            process(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll(MSG_SELECTOR).forEach(process);
          }
        }
      }
    });
    observer.observe(list, { childList: true, subtree: true });
    log("observing message list. new messages will be captured.");
  }

  /**
   * Discord is a single-page app: switching channels swaps the message list, and the list
   * isn't present at load. Poll until a list exists, and re-bind whenever it changes.
   */
  let currentList = null;
  setInterval(() => {
    const list = document.querySelector(LIST_SELECTOR);
    if (list && list !== currentList) {
      currentList = list;
      lastSeenAuthor = "";
      observe(list);
    }
  }, 1000);

  // Sleep detector. Warns when the tab goes "hidden" (Discord stops drawing, captures can be missed).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      log("⚠️ tab is HIDDEN. Discord may pause drawing; messages can be MISSED until you return.");
    } else {
      log("✓ tab is VISIBLE again, capturing normally.");
    }
  });

  log("content script loaded (captures only messages that arrive from now on).");
})();
