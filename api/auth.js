import { authRequest, checkOrigin, clearSession, ownerEmail, requireOwner, setSession, cookies } from '../lib/auth.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    checkOrigin(req);
    if (req.method === 'GET') {
      const user = await requireOwner(req, res);
      return res.status(200).json({ signedIn: true, email: user.email });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body?.action === 'logout') {
      const token = cookies(req).diet_access;
      if (token) await authRequest('logout', {}, token).catch(() => {});
      clearSession(res);
      return res.status(200).json({ signedIn: false });
    }
    const email = String(body?.email || '').trim().toLowerCase();
    if (email !== await ownerEmail()) return res.status(403).json({ error: 'Use the email address configured for this app.' });
    if (body.action === 'send') {
      await authRequest('otp', { email, create_user: true });
      return res.status(200).json({ sent: true });
    }
    if (body.action === 'verify' && /^\d{6,10}$/.test(body.code || '')) {
      const session = await authRequest('verify', { email, token: body.code, type: 'email' });
      if (!session.user?.email_confirmed_at || session.user?.email?.toLowerCase() !== email) return res.status(403).json({ error: 'Account mismatch.' });
      setSession(res, session);
      return res.status(200).json({ signedIn: true });
    }
    return res.status(400).json({ error: 'Enter a valid email code.' });
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Sign-in is temporarily unavailable.' });
  }
}
