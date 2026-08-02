import { useState } from "react";
import { CornerDownRight, ImageOff, SquareArrowOutUpRight, Sticker, X } from "lucide-react";
import type { DiscordMessage } from "@/lib/types";
import { parseDiscordContent, type DiscordMedia } from "@/lib/discord-media";

export function DiscordCard({
  message,
  onRemove,
  onOpen,
}: {
  message: DiscordMessage;
  onRemove: (id: string) => void;
  onOpen: (message: DiscordMessage) => void;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { text, media } = parseDiscordContent(message.content);

  return (
    <>
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
          {message.channelUrl && (
            <button
              onClick={() => onOpen(message)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Go to this channel's Discord tab"
              title="Go to this channel's Discord tab"
            >
              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
            </button>
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

        {text && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
        )}

        {media.length > 0 && (
          <div className="mt-3 space-y-2">
            {media.map((item, i) => (
              <MediaItem key={i} item={item} onZoom={setLightboxUrl} />
            ))}
          </div>
        )}
      </article>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function MediaItem({
  item,
  onZoom,
}: {
  item: DiscordMedia;
  onZoom: (url: string) => void;
}) {
  // Discord's CDN links are signed and expire after roughly a day, so an older
  // message's image will eventually stop loading. Say so rather than showing a
  // broken image icon.
  const [failed, setFailed] = useState(false);

  if (item.kind === "sticker") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sticker className="h-3.5 w-3.5" />
        Sticker: {item.name}
      </div>
    );
  }

  if (item.kind === "unknown") {
    return <div className="text-xs text-muted-foreground">(attachment)</div>;
  }

  if (failed) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <ImageOff className="h-3.5 w-3.5" />
        Attachment expired. Open in Discord.
      </a>
    );
  }

  if (item.kind === "gif") {
    return (
      <video
        src={item.url}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setFailed(true)}
        className="max-h-96 w-full rounded-lg border border-border object-contain"
      />
    );
  }

  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onClick={() => onZoom(item.url)}
      className="max-h-96 w-full cursor-pointer rounded-lg border border-border object-contain transition-opacity hover:opacity-90"
    />
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
