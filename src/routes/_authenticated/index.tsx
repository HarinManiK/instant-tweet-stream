import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import { logout } from "@/lib/auth";
import type { Tweet } from "@/lib/types";
import { TweetCard } from "@/components/TweetCard";
import { HandleManager } from "@/components/HandleManager";
import { StartStopButton } from "@/components/StartStopButton";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "Tweet Stream — Live Feed" }],
  }),
  component: FeedPage,
});

function FeedPage() {
  const navigate = useNavigate();
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    audioRef.current = new Audio("/notification_sound.mp3");
  }, []);

  useEffect(() => {
    const db = getDb();
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "tweets"), orderBy("capturedAt", "desc"), limit(100));
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        setTweets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tweet, "id">) })));
        setLoading(false);

        if (initialLoadRef.current) {
          initialLoadRef.current = false;
        } else {
          const hasNew = snap.docChanges().some(change => change.type === "added");
          if (hasNew && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
          }
        }
      },
    );
    return () => unsub();
  }, []);

  function handleLogout() {
    logout();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">Tweet Stream</h1>
          <button
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
        {!isFirebaseConfigured && (
          <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Firebase not configured
            </p>
            <p className="mt-1 text-muted-foreground">
              Paste your Firebase web config into <code>src/lib/firebase.ts</code> to connect.
            </p>
          </div>
        )}

        <section className="mb-6 rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Followed accounts</h2>
          <HandleManager />
        </section>

        <section className="space-y-3">
          {loading && isFirebaseConfigured && (
            <div className="flex animate-pulse flex-col space-y-4">
              <div className="h-32 w-full rounded-xl bg-muted" />
              <div className="h-32 w-full rounded-xl bg-muted" />
              <div className="h-32 w-full rounded-xl bg-muted" />
            </div>
          )}
          {!loading && tweets.length === 0 && isFirebaseConfigured && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No tweets yet. Add a handle, then hit Start.
            </div>
          )}
          {!loading && tweets.map((t) => (
            <TweetCard key={t.id} tweet={t} />
          ))}
        </section>
      </main>

      <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
        <StartStopButton />
      </div>
    </div>
  );
}
