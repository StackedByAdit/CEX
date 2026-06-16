const USERNAME_KEY = "orbit_username";
const LEGACY_TOKEN_KEY = "orbit_token";

export function setAuth(username: string) {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.setItem(USERNAME_KEY, username);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function clearAuth() {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function isAuthenticated(): boolean {
  return !!getUsername();
}
