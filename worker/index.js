// Tweet Stream Worker
// Watches Firestore stream_state/main. When status="running", connects to X
// filtered stream and writes incoming tweets to Firestore.

import admin from "firebase-admin";
import { TwitterApi, ETwitterStreamEvent } from "twitter-api-v2";
import express from "express";

// ---------- Firebase admin init ----------
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON env var");
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountJson);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------- X client init ----------
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
if (!X_BEARER_TOKEN) {
  console.error("Missing X_BEARER_TOKEN env var");
  process.exit(1);
}
const twitter = new TwitterApi(X_BEARER_TOKEN);

// ---------- State ----------
let currentStream = null;
let streaming = false;

// ---------- Helpers ----------
async function resolveHandleToId(handle) {
  try {
    const u = await twitter.v2.userByUsername(handle);
    return u?.data?.id ?? null;
  } catch (e) {
    console.error(`Failed to resolve @${handle}:`, e.message);
    return null;
  }
}

async function loadHandles() {
  const snap = await db.collection("followed_handles").get();
  const list = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    let userId = data.userId;
    if (!userId) {
      userId = await resolveHandleToId(doc.id);
      if (userId) await doc.ref.set({ userId }, { merge: true });
    }
    // Always push, userId is not strictly needed for the 'from:' stream rule
    list.push({ handle: doc.id, userId });
  }
  return list;
}

function buildRulesFromHandles(handles) {
  if (handles.length === 0) return [];
  // Group handles into 'from:' rules. Each rule max 512 chars on Pay-per-use/Basic.
  const tags = handles.map((h) => `from:${h.handle}`);
  // Combine into one rule if it fits, else split.
  const rules = [];
  let current = "";
  for (const t of tags) {
    const next = current ? `${current} OR ${t}` : t;
    if (next.length > 500) {
      rules.push({ value: current, tag: "group" });
      current = t;
    } else {
      current = next;
    }
  }
  if (current) rules.push({ value: current, tag: "group" });
  return rules;
}

async function setStreamRules(rules) {
  // Delete existing rules
  const existing = await twitter.v2.streamRules();
  if (existing.data?.length) {
    await twitter.v2.updateStreamRules({
      delete: { ids: existing.data.map((r) => r.id) },
    });
  }
  if (rules.length === 0) return;
  await twitter.v2.updateStreamRules({ add: rules });
}

function extractMedia(payload) {
  const result = [];
  const mediaKeys = payload.data?.attachments?.media_keys ?? [];
  const includedMedia = payload.includes?.media ?? [];
  for (const key of mediaKeys) {
    const m = includedMedia.find((x) => x.media_key === key);
    if (!m) continue;
    if (m.type === "photo") {
      result.push({
        type: "photo",
        url: m.url,
        width: m.width,
        height: m.height,
      });
    } else if (m.type === "video" || m.type === "animated_gif") {
      const variants = m.variants ?? [];
      const mp4s = variants.filter((v) => v.content_type === "video/mp4");
      mp4s.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
      const best = mp4s[0] ?? variants[0];
      if (best?.url) {
        result.push({
          type: m.type,
          url: best.url,
          previewUrl: m.preview_image_url,
          width: m.width,
          height: m.height,
        });
      }
    }
  }
  return result;
}

async function writeTweet(payload) {
  const t = payload.data;
  if (!t) return;
  const author = payload.includes?.users?.find((u) => u.id === t.author_id);
  const media = extractMedia(payload);
  const handle = author?.username ?? "";
  const doc = {
    id: t.id,
    text: t.text ?? "",
    createdAt: t.created_at ?? new Date().toISOString(),
    authorHandle: handle,
    authorName: author?.name ?? handle,
    authorAvatar: author?.profile_image_url?.replace("_normal", "_400x400") ?? "",
    media,
    tweetUrl: handle ? `https://x.com/${handle}/status/${t.id}` : `https://x.com/i/status/${t.id}`,
    capturedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection("tweets").doc(t.id).set(doc);
  console.log(`✓ Tweet ${t.id} from @${handle}`);
}

async function startStream() {
  if (streaming) return;
  streaming = true;
  console.log("Starting stream…");
  try {
    const handles = await loadHandles();
    if (handles.length === 0) {
      await db.doc("stream_state/main").set(
        { status: "stopped", lastError: "No handles to follow. Add one first." },
        { merge: true },
      );
      streaming = false;
      return;
    }
    const rules = buildRulesFromHandles(handles);
    await setStreamRules(rules);
    await db.doc("stream_state/main").set(
      { status: "running", rulesCount: rules.length, lastError: null },
      { merge: true },
    );

    currentStream = await twitter.v2.searchStream({
      "tweet.fields": ["created_at", "author_id", "attachments"],
      "user.fields": ["name", "username", "profile_image_url"],
      "media.fields": ["url", "preview_image_url", "variants", "type", "width", "height"],
      expansions: ["author_id", "attachments.media_keys"],
      autoConnect: false,
    });

    currentStream.on(ETwitterStreamEvent.Data, async (payload) => {
      try {
        await writeTweet(payload);
      } catch (e) {
        console.error("writeTweet failed:", e.message);
      }
    });
    currentStream.on(ETwitterStreamEvent.ConnectionError, (err) => {
      console.error("Stream connection error:", err);
    });
    currentStream.on(ETwitterStreamEvent.ConnectionClosed, () => {
      console.log("Stream connection closed.");
    });

    await currentStream.connect({ autoReconnect: true, autoReconnectRetries: Infinity });
    console.log(`Stream connected with ${rules.length} rule group(s).`);
  } catch (e) {
    console.error("startStream failed:", e);
    await db.doc("stream_state/main").set(
      { status: "stopped", lastError: e.message ?? "Unknown error" },
      { merge: true },
    );
    streaming = false;
  }
}

async function stopStream() {
  if (!streaming) return;
  console.log("Stopping stream…");
  try {
    if (currentStream) {
      currentStream.close();
      currentStream = null;
    }
  } catch (e) {
    console.error("stopStream error:", e.message);
  }
  streaming = false;
  await db.doc("stream_state/main").set({ status: "stopped" }, { merge: true });
}

// ---------- Watch stream_state ----------
db.doc("stream_state/main").onSnapshot(async (snap) => {
  const data = snap.data() ?? { status: "stopped" };
  if (data.status === "running" && !streaming) {
    await startStream();
  } else if (data.status === "stopped" && streaming) {
    await stopStream();
  }
});

// ---------- Watch followed_handles → rebuild rules if streaming ----------
let rebuildTimer = null;
db.collection("followed_handles").onSnapshot(() => {
  if (!streaming) return;
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(async () => {
    console.log("Handles changed, rebuilding rules…");
    await stopStream();
    await db.doc("stream_state/main").set({ status: "running" }, { merge: true });
  }, 2000);
});

// ---------- Minimal HTTP server so Render keeps it alive ----------
const app = express();
app.get("/", (_req, res) => res.send("Tweet Stream Worker OK"));
app.get("/health", (_req, res) => res.json({ ok: true, streaming }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Worker listening on :${port}`));

console.log("Worker started. Waiting for stream_state/main…");
