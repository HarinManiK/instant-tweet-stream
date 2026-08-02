import { CornerDownRight, ExternalLink, X } from "lucide-react";
import type { DiscordMessage } from "@/lib/types";

/** Deep link straight to the message inside Discord. */
function messageUrl(m: DiscordMessage): string | null {
  if (!m.channelUrl) return null;
  return `${m.channelUrl.replace(/\/+$/, "")}/${m.id}`;
}

export function DiscordCard({
  message,
  onRemove,
}: {
  message: DiscordMessage;
  onRemove: (id: string) => void;
}) {
  const url = messageUrl(message);

  return (
    <article className="group animate-in fade-in relative rounded-xl border border-border bg-card p-4 shadow-sm duration-100">
      <button
        onClick={() => onRemove(message.id)}
        aria-label="Remove message"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2 pr-6">
        <span className="truncate rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {message.server || "unknown"} <span className="text-muted-foreground">/</span> #
          {message.channel || "unknown"}
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Open in Discord"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {message.replyToAuthor && (
        <div className="mt-2 flex items-start gap-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground">
          <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">
            <span className="font-medium">{message.replyToAuthor}</span>
            {message.replyToSnippet ? `: ${message.replyToSnippet}` : ""}
          </span>
        </div>
      )}

      <header className="mt-2 flex items-baseline gap-2">
        <span className="truncate text-sm font-semibold">{message.author || "unknown"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTime(message.timestamp)}
        </span>
      </header>

      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {message.content}
      </p>
    </article>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Clamped: a capture machine whose clock trails Discord's would otherwise
  // render a brand-new message as "-4s".
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return d.toLocaleDateString();
}
