import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { FollowedHandle } from "@/lib/types";

export function HandleManager() {
  const [handles, setHandles] = useState<FollowedHandle[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const q = query(collection(db, "followed_handles"), orderBy("addedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setHandles(
          snap.docs.map((d) => ({ handle: d.id, ...(d.data() as Omit<FollowedHandle, "handle">) })),
        );
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, []);

  async function addHandle(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const raw = input.trim().replace(/^@/, "").toLowerCase();
    if (!raw) return;
    if (!/^[a-z0-9_]{1,15}$/.test(raw)) {
      setError("Invalid handle (letters, numbers, underscores; max 15)");
      return;
    }
    const db = getDb();
    if (!db) return;
    try {
      await setDoc(doc(db, "followed_handles", raw), {
        handle: raw,
        addedAt: serverTimestamp(),
      });
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    }
  }

  async function removeHandle(handle: string) {
    const db = getDb();
    if (!db) return;
    await deleteDoc(doc(db, "followed_handles", handle));
  }

  return (
    <div className="space-y-3">
      <form onSubmit={addHandle} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="elonmusk"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Add
        </button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {handles.length === 0 && (
          <p className="text-xs text-muted-foreground">No handles yet. Add one above.</p>
        )}
        {handles.map((h) => (
          <span
            key={h.handle}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
          >
            @{h.handle}
            <button
              onClick={() => removeHandle(h.handle)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${h.handle}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
