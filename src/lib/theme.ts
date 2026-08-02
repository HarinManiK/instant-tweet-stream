// Light/dark theme, persisted in localStorage. Default is dark.

const KEY = "tweet-stream-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Inline script string, run before hydration (in <head>) so the page never
// flashes the wrong theme.
//
// The server already renders <html class="dark">, matching the default, so this
// script only has work to do when someone has explicitly chosen light. Keeping
// the server's markup equal to the default is what stops React reporting a
// hydration mismatch on every single page load.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light")document.documentElement.classList.remove("dark");}catch(e){}})();`;
