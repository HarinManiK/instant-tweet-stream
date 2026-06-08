import type { Tweet } from "@/lib/types";

export function TweetCard({ tweet }: { tweet: Tweet }) {
  return (
    <article className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-xl border border-border bg-card p-4 shadow-sm">
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
          <a
            href={tweet.tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-muted-foreground hover:underline"
          >
            @{tweet.authorHandle} · {formatTime(tweet.createdAt)}
          </a>
        </div>
      </header>

      {tweet.text && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {tweet.text}
        </p>
      )}

      {tweet.media && tweet.media.length > 0 && (
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
                  className="w-full rounded-lg border border-border object-cover"
                  loading="lazy"
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
