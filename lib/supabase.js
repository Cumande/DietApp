export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vkuxvwmnddlshvomyyvb.supabase.co';
export async function supabase(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Object.assign(new Error('Server configuration is incomplete.'), { status: 503 });
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      ...options, signal: AbortSignal.timeout(12000),
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...options.headers }
    });
  } catch {
    throw Object.assign(new Error('Database temporarily unavailable. Your pending changes remain on this device.'), { status: 503 });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(data?.code === '40001' ? 'This entry changed on another device. Review the latest version before saving.' : 'The database could not complete this request.'), { status: data?.code === '40001' ? 409 : 503 });
  return data;
}
