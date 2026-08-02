// The extension flattens a message's attachments into its text as markers, so a
// message that is only a screenshot still has something to store. content.js
// emits these, and nothing else does:
//
//   [Image: <url>]      an attached image (the common case: posted charts)
//   [GIF: <url>]        an attached GIF, whose src Discord serves as video
//   [GIF]               a GIF it spotted but could not get a url for
//   [Sticker: <name>]   a sticker; Discord only exposes its name, not a url
//   [media]             something was attached that it did not recognise
//
// Rendering them as literal text is what made images show up as URLs. Here we
// pull them back out so the card can draw the real thing.

export type DiscordMedia =
  | { kind: "image"; url: string }
  | { kind: "gif"; url: string }
  | { kind: "sticker"; name: string }
  | { kind: "unknown" };

const PATTERNS: Array<{ re: RegExp; make: (capture: string) => DiscordMedia }> = [
  { re: /\[Image:\s*([^\]]+)\]/g, make: (url) => ({ kind: "image", url: url.trim() }) },
  { re: /\[GIF:\s*([^\]]+)\]/g, make: (url) => ({ kind: "gif", url: url.trim() }) },
  { re: /\[Sticker:\s*([^\]]+)\]/g, make: (name) => ({ kind: "sticker", name: name.trim() }) },
  { re: /\[GIF\]/g, make: () => ({ kind: "unknown" }) },
  { re: /\[media\]/g, make: () => ({ kind: "unknown" }) },
];

/**
 * Split a captured message into its readable text and its attachments.
 * Text with no markers comes back untouched.
 */
export function parseDiscordContent(content: string): {
  text: string;
  media: DiscordMedia[];
} {
  if (!content || !content.includes("[")) return { text: content ?? "", media: [] };

  const media: DiscordMedia[] = [];
  let text = content;

  for (const { re, make } of PATTERNS) {
    text = text.replace(re, (_match, capture: string) => {
      const item = make(capture);
      // A url-less GIF or an unrecognised attachment tells the reader nothing
      // useful, so only keep one as a hint rather than a row of empty boxes.
      if (item.kind !== "unknown" || !media.some((m) => m.kind === "unknown")) {
        media.push(item);
      }
      return "";
    });
  }

  // Collapse the whitespace the removed markers left behind.
  text = text.replace(/[ \t]{2,}/g, " ").trim();

  return { text, media };
}
