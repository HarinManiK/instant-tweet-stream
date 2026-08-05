// Client for the Feed Reader browser extension.
//
// Discord has no public firehose a normal user account can subscribe to, so the
// Discord half of this feed is captured on-device: the extension reads messages
// out of the DOM of the Discord tabs you already have open, stores them in
// IndexedDB, and its bridge.js content script relays them into this page over
// window.postMessage. Nothing Discord-related ever reaches our server or
// Firestore. Unlike tweets, these messages exist only in this browser.
//
// Protocol reference lives at the top of the extension's bridge.js.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscordMessage } from "@/lib/types";

/** Ceiling on rendered messages. Trading channels are chatty; the DOM is not free. */
const MAX_RENDERED = 500;

type BridgeEvent =
  | { type: "bridge" }
  | { type: "state"; capturing: boolean }
  | { type: "history"; messages: DiscordMessage[] }
  | { type: "message"; message: DiscordMessage }
  | { type: "updated"; message: DiscordMessage }
  | { type: "clear" }
  | { type: "deleted"; id: string }
  | { type: "focus-result"; token: string; focused: boolean };

function post(req: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.postMessage({ __readerReq: true, ...req }, "*");
}

/** Newest first, matching the tweet column's ordering. */
function sortNewestFirst(list: DiscordMessage[]) {
  return list.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0) || (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
}

export function useDiscordFeed(onNewMessage?: () => void) {
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [capturing, setCapturingState] = useState(true);
  const [connected, setConnected] = useState(false);

  // Held in a ref so a changing callback identity doesn't tear down the listener.
  const onNewRef = useRef(onNewMessage);
  onNewRef.current = onNewMessage;

  // Ids we've already rendered. The extension re-sends full history on every
  // reconnect (its service worker is recycled aggressively by Chrome), so the
  // page has to be the thing that dedupes.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handle(e: MessageEvent) {
      if (e.source !== window) return;
      const data = e.data as (BridgeEvent & { __reader?: boolean }) | undefined;
      if (!data || data.__reader !== true || !data.type) return;

      setConnected(true);

      if (data.type === "history") {
        const incoming = (data.messages ?? []).filter((m) => m?.id && !seenRef.current.has(m.id));
        if (incoming.length === 0) return;
        incoming.forEach((m) => seenRef.current.add(m.id));
        // History is a replay of what's already on disk, so it never rings.
        setMessages((prev) => sortNewestFirst([...prev, ...incoming]).slice(0, MAX_RENDERED));
        return;
      }

      if (data.type === "message") {
        const m = data.message;
        if (!m?.id || seenRef.current.has(m.id)) return;
        seenRef.current.add(m.id);
        setMessages((prev) => sortNewestFirst([m, ...prev]).slice(0, MAX_RENDERED));
        onNewRef.current?.();
        return;
      }

      // An attachment finished loading in Discord after we'd already shown the
      // message, so the extension re-sent it with the image url filled in.
      // Swap the card's data in place. It is the same message, so no sound.
      if (data.type === "updated") {
        const m = data.message;
        if (!m?.id) return;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        return;
      }

      if (data.type === "state") {
        setCapturingState(data.capturing);
        return;
      }

      if (data.type === "clear") {
        seenRef.current.clear();
        setMessages([]);
        return;
      }

      if (data.type === "deleted") {
        seenRef.current.delete(data.id);
        setMessages((prev) => prev.filter((m) => m.id !== data.id));
      }
    }

    window.addEventListener("message", handle);
    // The bridge announces itself on connect, but this page and that content
    // script race to load first. Asking is the other half of the handshake.
    post({ type: "hello" });
    return () => window.removeEventListener("message", handle);
  }, []);

  const setCapturing = useCallback((value: boolean) => {
    // Optimistic: the extension echoes a `state` event back to confirm.
    setCapturingState(value);
    post({ type: "set-capturing", value });
  }, []);

  const clear = useCallback(() => {
    post({ type: "clear" });
  }, []);

  const remove = useCallback((id: string) => {
    seenRef.current.delete(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    post({ type: "delete", id });
  }, []);

  /**
   * Focus the Discord tab already showing this message's channel, instead of
   * opening a duplicate tab on it. A web page has no access to browser tabs, so
   * the extension does the switching.
   *
   * If the extension does not confirm a focus quickly (no tab has that channel
   * open, the service worker is asleep, the extension is not installed at all),
   * we open the channel ourselves. The click always does something.
   *
   * The fallback stays inside Chrome's transient user activation window, so
   * window.open here is not treated as a popup.
   */
  const focusChannel = useCallback((m: DiscordMessage) => {
    if (!m.channelUrl) return;

    const deepLink = `${m.channelUrl.replace(/\/+$/, "")}/${m.id}`;
    let path = m.channelUrl;
    try {
      path = new URL(m.channelUrl).pathname;
    } catch {
      // Not a parseable URL. Matching on the raw string is still better than nothing.
    }

    // Ties this request to its answer, so two quick clicks can't cross wires.
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    function finish(focused: boolean) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onResult);
      if (!focused) window.open(deepLink, "_blank", "noopener,noreferrer");
    }

    function onResult(e: MessageEvent) {
      if (e.source !== window) return;
      const d = e.data as { __reader?: boolean; type?: string; token?: string; focused?: boolean };
      if (!d || d.__reader !== true || d.type !== "focus-result" || d.token !== token) return;
      finish(!!d.focused);
    }

    window.addEventListener("message", onResult);
    const timer = window.setTimeout(() => finish(false), 600);
    post({ type: "focus-channel", path, token });
  }, []);

  return { messages, capturing, connected, setCapturing, clear, remove, focusChannel };
}
