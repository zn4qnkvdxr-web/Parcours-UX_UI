/**
 * Suivi de parcours — lecture / écriture d'un état partagé.
 *
 *   GET  /api/progress?p=<slug>            → lecture publique
 *   POST /api/progress?p=<slug>&k=<jeton>  → écriture, jeton vérifié côté serveur
 *
 * Stockage : Upstash Redis via son API REST (aucune dépendance npm).
 * Une clé par parcours : parcours:<slug> → { checked, links, updatedAt }
 */

const KEY_PREFIX = 'parcours:';
const SLUG_RE    = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_BYTES  = 32 * 1024;

// L'intégration Vercel injecte l'un ou l'autre jeu de noms selon son millésime.
const STORE_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL   || '';
const STORE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const EDIT_TOKEN  = process.env.EDIT_TOKEN || '';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

const readSlug = request => {
  const slug = (new URL(request.url).searchParams.get('p') || '').toLowerCase();
  return SLUG_RE.test(slug) ? slug : null;
};

/** Comparaison à durée constante, pour ne pas fuiter le jeton caractère par caractère. */
function tokensMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function storeGet(key) {
  if (!STORE_URL) return null;
  const r = await fetch(`${STORE_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${STORE_TOKEN}` },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`store get ${r.status}`);
  const { result } = await r.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

async function storeSet(key, value) {
  if (!STORE_URL) throw new Error('store not configured');
  const r = await fetch(`${STORE_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STORE_TOKEN}` },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error(`store set ${r.status}`);
}

/** Ne conserve que ce que la page produit : des booléens et des URL. */
function sanitize(payload) {
  const checked = {};
  const links   = {};

  for (const [k, v] of Object.entries(payload?.checked || {})) {
    if (typeof k === 'string' && k.length <= 64 && v === true) checked[k] = true;
  }
  for (const [k, v] of Object.entries(payload?.links || {})) {
    if (typeof k !== 'string' || k.length > 64) continue;
    const url = String(v ?? '').trim().slice(0, 500);
    if (url) links[k] = url;
  }
  return { checked, links, updatedAt: new Date().toISOString() };
}

export async function GET(request) {
  const slug = readSlug(request);
  if (!slug) return json({ error: 'slug invalide' }, 400);

  try {
    const data = await storeGet(KEY_PREFIX + slug);
    return json(data || { checked: {}, links: {}, updatedAt: null });
  } catch (err) {
    return json({ error: 'lecture impossible' }, 502);
  }
}

export async function POST(request) {
  const slug = readSlug(request);
  if (!slug) return json({ error: 'slug invalide' }, 400);

  if (!EDIT_TOKEN) return json({ error: 'écriture non configurée' }, 500);

  const url = new URL(request.url);
  const given = url.searchParams.get('k') || request.headers.get('x-edit-token') || '';
  if (!tokensMatch(given, EDIT_TOKEN)) return json({ error: 'jeton invalide' }, 403);

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BYTES) return json({ error: 'charge trop lourde' }, 413);
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'corps illisible' }, 400);
  }

  const clean = sanitize(payload);

  try {
    await storeSet(KEY_PREFIX + slug, clean);
    return json({ ok: true, updatedAt: clean.updatedAt });
  } catch (err) {
    return json({ error: 'écriture impossible' }, 502);
  }
}
