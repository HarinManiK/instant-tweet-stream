// Light/dark theme, persisted in localStorage. Default is light (current look).

const KEY = "tweet-stream-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
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
// flashes light before switching to a stored dark preference.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}})();`;
