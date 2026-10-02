import { requireOwner } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
const scopes = new Set(['meals', 'weights', 'training', 'foods', 'favorites', 'mealPresets']);
export function validateChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 500) throw Object.assign(new Error('Invalid changes.'), { status: 400 });
  for (const change of changes) {
    if (!change || typeof change !== 'object' || (change.exists && !Object.hasOwn(change, 'before'))) throw Object.assign(new Error('Invalid change.'), { status: 400 });
    if (change.parentDepth !== undefined && (!Number.isInteger(change.parentDepth) || change.parentDepth < 0 || change.parentDepth >= change.path?.length)) throw Object.assign(new Error('Invalid parent guard.'), { status: 400 });
    if (!Array.isArray(change.path) || change.path.length < 2 || change.path.length > 10 || !scopes.has(change.path[0]) || change.path.some(key => typeof key !== 'string' || key.length > 500 || ['__proto__', 'constructor', 'prototype'].includes(key)) || typeof change.exists !== 'boolean' || typeof change.remove !== 'boolean' || (!change.remove && !Object.hasOwn(change, 'value'))) throw Object.assign(new Error('Invalid change path.'), { status: 400 });
  }
  if (JSON.stringify(changes).length > 250000) throw Object.assign(new Error('Too many changes in one request.'), { status: 413 });
  return changes;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-cache');
  try {
    await requireOwner(req, res);
    if (req.method === 'GET') {
      const meta = await supabase('/rest/v1/nutrition_state?id=eq.diet_90_97&select=updated_at');
      if (!meta?.[0]) return res.status(503).json({ error: 'Your data is unavailable. No empty replacement has been created.' });
      const etag = `"${meta[0].updated_at}"`;
      if (req.headers['if-none-match'] === etag) { res.setHeader('ETag', etag); return res.status(304).end(); }
      const rows = await supabase('/rest/v1/nutrition_state?id=eq.diet_90_97&select=data,updated_at');
      res.setHeader('ETag', `"${rows[0].updated_at}"`);
      return res.status(200).json(rows[0].data);
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body?.changes) return res.status(409).json({ error: 'Please reload the app to use the new secure sync.' });
      const result = await supabase('/rest/v1/rpc/diet_apply_changes', { method: 'POST', body: JSON.stringify({ changes: validateChanges(body.changes) }) });
      res.setHeader('ETag', `"${result.updated_at}"`);
      return res.status(200).json(result.data);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('nutrition-data', { status: error.status || 500, message: error.message });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to sync. Your pending changes are kept on this device.' });
  }
}
