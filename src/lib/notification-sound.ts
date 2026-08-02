// Shared new-item notification sound, used by both feed columns.
//
// This is the same Web Audio approach the tweet feed has always used, lifted out
// of the route so the Discord column rings with it too. A decoded AudioBuffer
// played through a fresh BufferSource fires with no latency and can overlap with
// itself, which matters when two feeds land at once.
//
// Autoplay policy: an AudioContext created without a user gesture starts
// "suspended". In this app the login form guarantees a gesture before the feed
// ever renders, and play() resumes the context defensively anyway.

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;

/**
 * Create the AudioContext and decode the notification clip.
 * Returns a teardown function; call it when the feed unmounts.
 */
export function initNotificationSound(): () => void {
  if (typeof window === "undefined") return () => {};

  const audioCtx = new AudioContext();
  ctx = audioCtx;

  fetch("/notification_sound.mp3")
    .then((r) => r.arrayBuffer())
    .then((buf) => audioCtx.decodeAudioData(buf))
    .then((decoded) => {
      buffer = decoded;
    })
    .catch((e) => console.error("Failed to load notification sound:", e));

  return () => {
    audioCtx.close();
    if (ctx === audioCtx) {
      ctx = null;
      buffer = null;
    }
  };
}

/** Play the notification. No-op until the clip has finished decoding. */
export function playNotificationSound() {
  if (!ctx || !buffer) return;
  if (ctx.state === "suspended") ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
}
