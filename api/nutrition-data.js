const SUPABASE_URL = process.env.SUPABASE_URL || "https://vkuxvwmnddlshvomyyvb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = "nutrition_state";
const STATE_ID = "diet_90_97";
const DEFAULT_STATE = {
  meals: {},
  weights: {
    "2026-07-05": 88.6,
    "2026-07-14": 90,
    "2026-07-25": 92.1,
    "2026-08-22": 90,
    "2026-08-09": 92.3,
    "2026-08-15": 90.775
  },
  training: {},
  foods: {},
  favorites: {},
  mealPresets: {}
};

function normalizeWeights(value) {
  const weights = value && typeof value === "object" ? { ...value } : { ...DEFAULT_STATE.weights };

  if (Number(weights["2026-09-08"]) === 92.3) {
    if (weights["2026-08-09"] == null) weights["2026-08-09"] = 92.3;
    delete weights["2026-09-08"];
  }
  if (Number(weights["2026-09-15"]) === 90.75) {
    if (weights["2026-08-15"] == null) weights["2026-08-15"] = 90.775;
    delete weights["2026-09-15"];
  }

  return weights;
}

function normalizeState(value) {
  return {
    meals: value && typeof value.meals === "object" ? value.meals : {},
    weights: normalizeWeights(value?.weights),
    training: value && typeof value.training === "object" ? value.training : {},
    foods: value && typeof value.foods === "object" ? value.foods : {},
    favorites: value && typeof value.favorites === "object" ? value.favorites : {},
    mealPresets: value && typeof value.mealPresets === "object" ? value.mealPresets : {}
  };
}

function applyMutation(state, mutation) {
  const allowedScopes = new Set(["meals", "weights", "training", "foods", "favorites", "mealPresets"]);
  if (!mutation || !allowedScopes.has(mutation.scope) || typeof mutation.key !== "string") {
    throw new Error("Invalid sync mutation");
  }

  const next = normalizeState(state);
  if (mutation.value === null) {
    delete next[mutation.scope][mutation.key];
  } else {
    next[mutation.scope] = { ...next[mutation.scope], [mutation.key]: mutation.value };
  }
  return next;
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

  if (!SUPABASE_KEY) {
    return res.status(503).json({
      error: "SUPABASE_SERVICE_ROLE_KEY manque dans les variables Vercel"
    });
  }

  try {
    if (req.method === "GET") {
      const rows = await supabaseRequest(`${TABLE}?id=eq.${STATE_ID}&select=data`);
      return res.status(200).json(normalizeState(rows?.[0]?.data || DEFAULT_STATE));
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
      let state;

      if (body?.mutation) {
        const rows = await supabaseRequest(`${TABLE}?id=eq.${STATE_ID}&select=data`);
        state = applyMutation(rows?.[0]?.data || DEFAULT_STATE, body.mutation);
      } else {
        state = normalizeState(body);
      }

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
