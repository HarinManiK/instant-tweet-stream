import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { logout } from "@/lib/auth";
import { initNotificationSound, playNotificationSound } from "@/lib/notification-sound";
import { TweetColumn } from "@/components/TweetColumn";
import { DiscordColumn } from "@/components/DiscordColumn";
import { SettingsPanel } from "@/components/SettingsPanel";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "InstantFeed (X + Discord)" }],
  }),
  component: FeedPage,
});

function FeedPage() {
  const navigate = useNavigate();

  // One shared sound for both columns, owned here so the two feeds don't each
  // spin up their own AudioContext.
  useEffect(() => initNotificationSound(), []);
  const ping = useCallback(() => playNotificationSound(), []);

  function handleLogout() {
    logout();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">InstantFeed</h1>
          <div className="ml-auto flex items-center gap-3">
            <SettingsPanel />
            <button
              onClick={handleLogout}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Two independently scrolling columns: X on the left, Discord on the right. */}
      <main className="grid min-h-0 flex-1 grid-cols-2 gap-4 p-4">
        <TweetColumn onNewTweet={ping} />
        <DiscordColumn onNewMessage={ping} />
      </main>
    </div>
  );
}
