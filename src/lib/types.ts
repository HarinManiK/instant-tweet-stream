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
