export type MediaItem = {
  type: "photo" | "video" | "animated_gif";
  url: string;
  previewUrl?: string;
  width?: number;
  height?: number;
};

export type Tweet = {
  id: string;
  text: string;
  createdAt: string;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  media: MediaItem[];
  tweetUrl: string;
  capturedAt?: { seconds: number; nanoseconds: number } | null;
  isRetweet?: boolean;
  retweetedBy?: string;
};

// A Discord message captured by the Feed Reader browser extension and handed to
// this page through bridge.js. It never touches our server — see lib/discord.ts.
export type DiscordMessage = {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  server: string;
  channel: string;
  replyToAuthor?: string;
  replyToSnippet?: string;
  channelUrl?: string;
  source?: "discord";
  /** Message time in ms, derived from the Discord snowflake id. Sort key. */
  ts?: number;
  capturedAt?: number;
};

export type FollowedHandle = {
  handle: string;
  userId?: string;
  addedAt?: { seconds: number; nanoseconds: number } | null;
};

export type StreamStatus = "running" | "stopped" | "starting" | "stopping";

export type StreamState = {
  status: StreamStatus;
  lastError?: string | null;
  startedAt?: { seconds: number; nanoseconds: number } | null;
  stoppedAt?: { seconds: number; nanoseconds: number } | null;
  rulesCount?: number;
};
