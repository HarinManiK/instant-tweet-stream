import { useEffect, useRef, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ChevronDown } from "lucide-react";
import { getDb, isFirebaseConfigured } from "@/lib/firebase";
import type { Tweet } from "@/lib/types";
import { TweetCard } from "@/components/TweetCard";
import { HandleManager } from "@/components/HandleManager";

export function TweetColumn({ onNewTweet }: { onNewTweet: () => void }) {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [handlesOpen, setHandlesOpen] = useState(false);
  const initialLoadRef = useRef(true);

  // Held in a ref so a changing callback identity doesn't resubscribe Firestore.
  const onNewRef = useRef(onNewTweet);
  onNewRef.current = onNewTweet;

  useEffect(() => {
    const db = getDb();
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "tweets"), orderBy("capturedAt", "desc"), limit(100));
    const unsub = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      setTweets(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tweet, "id">) })));
      setLoading(false);

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        return;
      }
      if (snap.docChanges().some((change) => change.type === "added")) {
        onNewRef.current();
      }
    });
    return () => unsub();
  }, []);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
          <h2 className="text-sm font-semibold tracking-tight">X</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{tweets.length}</span>

          <button
            onClick={() => setHandlesOpen((v) => !v)}
            className="ml-auto flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            aria-expanded={handlesOpen}
          >
            Accounts
            <ChevronDown
              className={`h-3 w-3 transition-transform ${handlesOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {handlesOpen && (
          <div className="border-t border-border px-4 py-3">
            <HandleManager />
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-28">
        {!isFirebaseConfigured && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">
              Firebase not configured
            </p>
            <p className="mt-1 text-muted-foreground">
              Paste your Firebase web config into <code>src/lib/firebase.ts</code> to connect.
            </p>
          </div>
        )}

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

        {!loading && tweets.map((t) => <TweetCard key={t.id} tweet={t} />)}
      </div>
    </section>
  );
}
