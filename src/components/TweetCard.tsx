import { useState } from "react";
import { ExternalLink, Repeat2, X } from "lucide-react";
import type { Tweet } from "@/lib/types";

function stripMediaUrls(text: string, hasMedia: boolean): string {
  if (!hasMedia) return text;
  return text
    .replace(/https?:\/\/t\.co\/\w+/g, "")
    .replace(/https?:\/\/(?:x|twitter)\.com\/\S+\/(?:video|photo)\/\d+/g, "")
    .trimEnd();
}

export function TweetCard({ tweet }: { tweet: Tweet }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hasMedia = tweet.media && tweet.media.length > 0;
  const cleanText = tweet.text ? stripMediaUrls(tweet.text, !!hasMedia) : "";

  return (
    <>
      <article className="animate-in fade-in duration-100 rounded-xl border border-border bg-card p-4 shadow-sm">
        {tweet.isRetweet && tweet.retweetedBy && (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" />
            <span>@{tweet.retweetedBy} reposted</span>
          </div>
        )}
        <header className="flex items-center gap-3">
          {tweet.authorAvatar ? (
            <img
              src={tweet.authorAvatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{tweet.authorName}</div>
            <div className="truncate text-xs text-muted-foreground">
              @{tweet.authorHandle} · {formatTime(tweet.createdAt)}
            </div>
          </div>
          {tweet.tweetUrl && (
            <a
              href={tweet.tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="View on X"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </header>

        {cleanText && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {cleanText}
          </p>
        )}

        {hasMedia && (
          <div
            className={`mt-3 grid gap-2 ${
              tweet.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {tweet.media.map((m, i) => {
              if (m.type === "photo") {
                return (
                  <img
                    key={i}
                    src={m.url}
                    alt=""
                    className="w-full cursor-pointer rounded-lg border border-border object-cover transition-opacity hover:opacity-90"
                    loading="lazy"
                    onClick={() => setLightboxUrl(m.url)}
                  />
                );
              }
              if (m.type === "video") {
                return (
                  <video
                    key={i}
                    src={m.url}
                    poster={m.previewUrl}
                    controls
                    playsInline
                    className="w-full rounded-lg border border-border"
                  />
                );
              }
              return (
                <video
                  key={i}
                  src={m.url}
                  poster={m.previewUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full rounded-lg border border-border"
                />
              );
            })}
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

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return d.toLocaleDateString();
}
