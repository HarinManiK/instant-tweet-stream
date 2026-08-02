import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { StreamState } from "@/lib/types";

/**
 * The X stream's on/off switch, read from and written to stream_state/main.
 *
 * The Render worker watches that doc and opens or tears down its X connection to
 * match, so pausing here genuinely stops posts arriving (and being billed), it
 * does not merely hide them.
 */
export function useStreamState() {
  const [state, setState] = useState<StreamState | null>(null);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsub = onSnapshot(doc(db, "stream_state", "main"), (snap) => {
      setState((snap.data() as StreamState) ?? { status: "stopped" });
    });
    return () => unsub();
  }, []);

  const status = state?.status ?? "stopped";
  const isRunning = status === "running" || status === "starting";

  const toggle = useCallback(async () => {
    const db = getDb();
    if (!db) return;
    await setDoc(
      doc(db, "stream_state", "main"),
      {
        status: isRunning ? "stopped" : "running",
        ...(isRunning
          ? { stoppedAt: serverTimestamp() }
          : { startedAt: serverTimestamp(), lastError: null }),
      },
      { merge: true },
    );
  }, [isRunning]);

  return { status, isRunning, lastError: state?.lastError ?? null, toggle };
}
