import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { StreamState } from "@/lib/types";

export function StartStopButton() {
  const [state, setState] = useState<StreamState | null>(null);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const unsub = onSnapshot(doc(db, "stream_state", "main"), (snap) => {
      setState((snap.data() as StreamState) ?? { status: "stopped" });
    });
    return () => unsub();
  }, []);

  async function toggle() {
    const db = getDb();
    if (!db) return;
    const isRunning = state?.status === "running" || state?.status === "starting";
    await setDoc(
      doc(db, "stream_state", "main"),
      {
        status: isRunning ? "stopped" : "running",
        ...(isRunning ? { stoppedAt: serverTimestamp() } : { startedAt: serverTimestamp(), lastError: null }),
      },
      { merge: true },
    );
  }

  const status = state?.status ?? "stopped";
  const isRunning = status === "running" || status === "starting";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={toggle}
        className={`group relative flex h-16 w-16 items-center justify-center rounded-full text-sm font-semibold shadow-lg transition-all hover:scale-105 ${
          isRunning
            ? "bg-destructive text-destructive-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {isRunning ? (
          <span className="block h-4 w-4 rounded-sm bg-current" />
        ) : (
          <span className="ml-1 block h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-current" />
        )}
      </button>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === "running"
              ? "bg-green-500 animate-pulse"
              : status === "starting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-muted-foreground"
          }`}
        />
        <span className="text-muted-foreground">
          {status === "running"
            ? "Streaming"
            : status === "starting"
              ? "Starting…"
              : status === "stopping"
                ? "Stopping…"
                : "Stopped"}
        </span>
      </div>
      {state?.lastError && (
        <p className="max-w-xs text-center text-xs text-destructive">{state.lastError}</p>
      )}
    </div>
  );
}
