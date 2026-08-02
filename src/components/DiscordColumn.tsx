import { useDiscordFeed } from "@/lib/discord";
import { DiscordCard } from "@/components/DiscordCard";

export function DiscordColumn({ onNewMessage }: { onNewMessage: () => void }) {
  const { messages, capturing, connected, setCapturing, clear, remove, focusChannel } =
    useDiscordFeed(onNewMessage);

  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            connected && capturing
              ? "animate-pulse bg-green-500"
              : connected
                ? "bg-yellow-500"
                : "bg-muted-foreground"
          }`}
        />
        <h2 className="text-sm font-semibold tracking-tight">Discord</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{messages.length}</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setCapturing(!capturing)}
            disabled={!connected}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40"
          >
            {capturing ? "Pause" : "Resume"}
          </button>
          <button
            onClick={clear}
            disabled={!connected}
            className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!connected && <ExtensionMissing />}

        {connected && messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {capturing
              ? "Listening. Keep your Discord tabs open. Messages appear here as they arrive."
              : "Capture is paused."}
          </div>
        )}

        {messages.map((m) => (
          <DiscordCard key={m.id} message={m} onRemove={remove} onOpen={focusChannel} />
        ))}
      </div>
    </section>
  );
}

function ExtensionMissing() {
  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
      <p className="font-medium text-yellow-600 dark:text-yellow-400">
        Feed Reader extension not detected
      </p>
      <p className="mt-1 text-muted-foreground">
        Discord messages are captured on this device by the Feed Reader Chrome extension.
        They never touch a server, so this column only fills in on a machine running it.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>
          Load the <code className="text-foreground">DiscordExtension</code> folder at{" "}
          <code className="text-foreground">chrome://extensions</code> (Developer mode → Load
          unpacked).
        </li>
        <li>Reload this page.</li>
        <li>Open the Discord channels you want to follow and leave those tabs open.</li>
      </ol>
    </div>
  );
}
