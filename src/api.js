const API_URL = import.meta.env.VITE_API_URL || '/api';

export function getSession() {
  try { return JSON.parse(localStorage.getItem('smartdesk-session')); } catch { return null; }
}
export function setSession(session) { localStorage.setItem('smartdesk-session', JSON.stringify(session)); }
export function clearSession() { localStorage.removeItem('smartdesk-session'); }

export async function api(path, options = {}) {
  const session = getSession();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}), ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Something went wrong. Please try again.');
  return body;
}
