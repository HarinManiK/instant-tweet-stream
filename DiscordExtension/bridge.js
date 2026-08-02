// Feed Reader bridge. Runs on the HOSTED FEED SITE.
// -----------------------------------------------------------------------------
// This content script is what lets the feed site show your OWN captured Discord
// messages, on your OWN device, with the site's server storing nothing.
//
// It is a relay:
//   background worker  <--(chrome port)-->  bridge.js  <--(window.postMessage)-->  the page's JS
//
// The Discord data goes straight from the extension into the page in the same
// browser. The server only ever served the page's HTML/JS; it never sees a message.
//
// The site's matching domains are listed in manifest.json under the bridge.js
// content_scripts entry. Add your production domain there.
//
// PROTOCOL
//   From extension -> page  (window.postMessage, event.data shape):
//     { __reader: true, type: "bridge"                    }  // extension is present
//     { __reader: true, type: "state",   capturing: <bool> }
//     { __reader: true, type: "history", messages: [ <msg>, ... ] }  // on every (re)connect
//     { __reader: true, type: "message", message: <msg>   }  // each new capture, live
//     { __reader: true, type: "clear"                     }  // history was wiped
//     { __reader: true, type: "deleted", id: <string>     }  // one message removed
//
//   From page -> extension  (window.postMessage from the page):
//     window.postMessage({ __readerReq: true, type: "hello" }, "*");
//     window.postMessage({ __readerReq: true, type: "clear" }, "*");
//     window.postMessage({ __readerReq: true, type: "set-capturing", value: <bool> }, "*");
//     window.postMessage({ __readerReq: true, type: "delete", id: <string> }, "*");
//
//   A <msg> is: { id, author, content, timestamp, server, channel,
//                 replyToAuthor, replyToSnippet, channelUrl, source, ts, capturedAt }
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  let port = null;

  function announce() {
    // Tells the page an extension is installed. Sent on connect and on demand,
    // because this script and the page's React app race to be ready first.
    window.postMessage({ __reader: true, type: "bridge" }, "*");
  }

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "viewer" });
    } catch (e) {
      setTimeout(connect, 1000);
      return;
    }
    announce();
    // Forward everything the extension sends into the page.
    port.onMessage.addListener((m) => {
      window.postMessage(Object.assign({ __reader: true }, m), "*");
    });
    // If the background worker recycles, reconnect and re-sync (page dedupes by id).
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, 1000);
    });
  }

  // Relay control requests from the page back to the extension.
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__readerReq !== true) return;
    if (d.type === "hello") {
      announce();
    } else if (d.type === "clear") {
      chrome.runtime.sendMessage({ type: "clear" });
    } else if (d.type === "set-capturing") {
      chrome.runtime.sendMessage({ type: "set-capturing", value: !!d.value });
    } else if (d.type === "delete") {
      if (d.id) chrome.runtime.sendMessage({ type: "delete", id: d.id });
    }
  });

  connect();
})();
