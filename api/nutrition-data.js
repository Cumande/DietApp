const SUPABASE_URL = process.env.SUPABASE_URL || "https://vkuxvwmnddlshvomyyvb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_vhqfatzZkmmmyLYQskyCXA_aahBmNxc";

const TABLE = "nutrition_state";
const STATE_ID = "diet_90_97";
const DEFAULT_STATE = {
  meals: {},
  weights: {
    "2025-07-27": 90.25,
    "2026-07-05": 88.6,
    "2026-07-14": 90,
    "2026-07-25": 92.1,
    "2026-08-21": 96,
    "2026-08-22": 90,
    "2026-09-08": 92.3,
    "2026-09-15": 90.75
  },
  training: {}
};

function isAuthorized(req) {
  const expectedPin = process.env.APP_PIN;
  if (!expectedPin) return true;
  return req.headers["x-app-pin"] === expectedPin;
}

function normalizeState(value) {
  return {
    meals: value && typeof value.meals === "object" ? value.meals : {},
    weights: value && typeof value.weights === "object" ? value.weights : DEFAULT_STATE.weights,
    training: value && typeof value.training === "object" ? value.training : {}
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      ...options.headers
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase error ${response.status}`);
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const rows = await supabaseRequest(`${TABLE}?id=eq.${STATE_ID}&select=data`);
      return res.status(200).json(normalizeState(rows?.[0]?.data || DEFAULT_STATE));
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
      const state = normalizeState(body);

      await supabaseRequest(`${TABLE}?on_conflict=id`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          id: STATE_ID,
          data: state,
          updated_at: new Date().toISOString()
        })
      });

      return res.status(200).json(state);
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
