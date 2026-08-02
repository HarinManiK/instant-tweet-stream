// Feed Reader. Keep-awake, injected into Discord's OWN JavaScript world.
// -----------------------------------------------------------------------------
// This runs in the page's MAIN world (not the isolated content-script world) so
// that Discord's own code sees the overrides below. It does two things:
//
//   1. Visibility/focus spoof: make Discord always believe the tab is visible and
//      focused, so it never throttles/pauses rendering new messages when unfocused.
//
//   2. Silent audio keepalive: play an effectively inaudible tone so Chrome marks
//      the tab "audible" and therefore will not freeze or intensively throttle it
//      in the background. Browser autoplay rules mean the tone can only start after
//      one interaction with the page, so we (re)start it on the first click/keypress
//      and whenever the tab regains focus. After that it persists while unfocused.
// -----------------------------------------------------------------------------

(function () {
  "use strict";

  // ---- 1. Visibility / focus spoof ------------------------------------------
  function forceGetter(obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, { configurable: true, get: () => value });
    } catch (e) {}
  }

  forceGetter(document, "hidden", false);
  forceGetter(document, "visibilityState", "visible");
  forceGetter(document, "webkitHidden", false);
  forceGetter(document, "webkitVisibilityState", "visible");
  try { document.hasFocus = () => true; } catch (e) {}

  // Swallow the events Discord uses to notice it went to the background. We run in
  // the capture phase and register at document_start, so we fire before Discord's
  // handlers and stop the event from ever reaching them.
  const swallow = (e) => e.stopImmediatePropagation();
  for (const ev of ["visibilitychange", "webkitvisibilitychange", "blur"]) {
    window.addEventListener(ev, swallow, true);
    document.addEventListener(ev, swallow, true);
  }

  // ---- 2. Silent audio keepalive --------------------------------------------
  let ctx = null;

  function startTone() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        // ~30 Hz is below what typical laptop speakers reproduce, and the gain is
        // tiny, so it is inaudible in practice, but it is a real signal, so Chrome
        // flags the tab as audible. Raise/lower gain if your hardware plays it.
        osc.frequency.value = 30;
        gain.gain.value = 0.003;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch (e) {}
  }

  // Try immediately (works if discord.com already has autoplay permission), then
  // guarantee it on the first interaction, and keep it resumed forever.
  startTone();
  for (const ev of ["pointerdown", "keydown", "click", "focus"]) {
    window.addEventListener(ev, startTone, true);
  }
  setInterval(startTone, 15000);
})();
