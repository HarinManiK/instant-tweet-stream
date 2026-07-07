import { useEffect, useState } from "react";
import { Timestamp, collection, onSnapshot, query, where } from "firebase/firestore";
import { Settings } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { FEATURE_LAUNCH_AT } from "@/lib/stats";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    const q = query(
      collection(db, "tweets"),
      where("capturedAt", ">=", Timestamp.fromDate(FEATURE_LAUNCH_AT)),
    );
    const unsub = onSnapshot(q, (snap) => setPostCount(snap.size));
    return () => unsub();
  }, []);

  function toggleTheme(checked: boolean) {
    const next: Theme = checked ? "dark" : "light";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Settings"
        className="fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:scale-105"
      >
        <Settings className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Preferences and stream stats.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Posts fetched</p>
              <p className="text-xs text-muted-foreground">Since this feature went live</p>
            </div>
            <span className="text-lg font-semibold tabular-nums">{postCount}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Pay</p>
              <p className="text-xs text-muted-foreground">Estimated X API cost</p>
            </div>
            <span className="text-lg font-semibold tabular-nums">${(postCount * 0.0075).toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
