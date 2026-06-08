// Simple hardcoded login. NOT secure — anyone who views page source can read the password.
// Fine for personal use only.

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "admin!@#123";

const KEY = "tweet-stream-auth";

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "ok";
}

export function login(username: string, password: string): boolean {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    localStorage.setItem(KEY, "ok");
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem(KEY);
}
