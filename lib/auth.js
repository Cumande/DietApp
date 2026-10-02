import { SUPABASE_URL, supabase } from './supabase.js';
const cookieOptions = 'HttpOnly; Secure; SameSite=Strict; Path=/';
export function setSession(res, session) {
  res.setHeader('Set-Cookie', [
    `diet_access=${encodeURIComponent(session.access_token)}; Max-Age=${session.expires_in || 3600}; ${cookieOptions}`,
    `diet_refresh=${encodeURIComponent(session.refresh_token)}; Max-Age=2592000; ${cookieOptions}`
  ]);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', ['diet_access', 'diet_refresh'].map(name => `${name}=; Max-Age=0; ${cookieOptions}`));
}
export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(part => {
    const split = part.indexOf('=');
    if (split < 0) return ['', ''];
    try { return [part.slice(0, split).trim(), decodeURIComponent(part.slice(split + 1))]; }
    catch { return ['', '']; }
  }));
}
export async function ownerEmail() {
  const rows = await supabase('/rest/v1/diet_owner?select=email&limit=1');
  if (!rows?.[0]?.email) throw Object.assign(new Error('Owner sign-in has not been configured yet.'), { status: 503 });
  return rows[0].email.toLowerCase();
}
export async function authRequest(path, body, token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(12000),
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 429 ? 'Too many attempts. Please wait before trying again.' : 'Sign-in failed. Request a new email code and try again.'), { status: response.status === 429 ? 429 : 401 });
  return data;
}
export function checkOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw Object.assign(new Error('Cross-site request rejected.'), { status: 403 });
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw Object.assign(new Error('Invalid request origin.'), { status: 403 });
}
export async function requireOwner(req, res) {
  checkOrigin(req);
  const stored = cookies(req);
  let user;
  if (stored.diet_access) {
    try { user = await authRequest('user', null, stored.diet_access); }
    catch (error) { if (error.status !== 401) throw error; }
  }
  if (!user && stored.diet_refresh) {
    const session = await authRequest('token?grant_type=refresh_token', { refresh_token: stored.diet_refresh });
    user = session.user;
    setSession(res, session);
  }
  if (!user) throw Object.assign(new Error('Please sign in to sync your data.'), { status: 401 });
  if (!user.email_confirmed_at || user.email?.toLowerCase() !== await ownerEmail()) {
    clearSession(res);
    throw Object.assign(new Error('This account does not have access.'), { status: 403 });
  }
  return user;
}
