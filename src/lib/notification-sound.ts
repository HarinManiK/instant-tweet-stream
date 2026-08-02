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
 * Emit a continuously-running tone at 30 Hz and near-zero gain: below what
 * typical speakers reproduce, but a real signal, so Chrome marks the tab
 * "audible" and won't freeze it after a few minutes in the background.
 *
 * Without this, a feed tab sitting behind another tab gets frozen and stops
 * ringing on new messages, which looks exactly like the feed having died.
 * The extension plays the same trick inside Discord's own tabs (page-spoof.js).
 */
function startKeepAlive(audioCtx: AudioContext) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 30;
  gain.gain.value = 0.003;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  return osc;
}

/**
 * Create the AudioContext, decode the notification clip, and start the
 * anti-freeze keepalive. Returns a teardown function; call it when the feed
 * unmounts.
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

  const osc = startKeepAlive(audioCtx);

  // The context starts suspended until a user gesture, and Chrome may suspend it
  // again on its own. Nudge it periodically so the keepalive genuinely stays on.
  const resume = () => {
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  };
  const timer = window.setInterval(resume, 15000);
  const events = ["pointerdown", "keydown", "click"] as const;
  events.forEach((e) => window.addEventListener(e, resume, { capture: true }));

  return () => {
    window.clearInterval(timer);
    events.forEach((e) => window.removeEventListener(e, resume, { capture: true }));
    try {
      osc.stop();
    } catch {
      // Already stopped, or the context is closing. Nothing to do.
    }
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
