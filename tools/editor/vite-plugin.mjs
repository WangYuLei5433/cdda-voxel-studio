// Dev-server endpoints for the studio (index.html):
//   GET /api/editor/overrides  → public/data/appearance.local.json (or an empty document)
//   PUT /api/editor/overrides  → validate and write it (git-ignored, local only)
// The CDDA object catalog is a static file (public/data/cdda, tools/editor/catalog.mjs --write).
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';


const KINDS = new Set(['ter', 'furn', 'item', 'monster', 'vehicle']);
const ID = /^[A-Za-z0-9_:.|-]+$/;
const NUMBER_FIELDS = ['scale', 'fit', 'y', 'rotX', 'rotY', 'rotZ'];

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) fail(new Error('request body is too large'));
    });
    req.on('end', () => ok(body));
    req.on('error', fail);
  });
}

/** Check an override document; returns a clean copy or throws with the reason. */
export function validateOverrides(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('document must be an object');
  const models = {};
  for (const [key, entry] of Object.entries(doc.models ?? {})) {
    if (!ID.test(key)) throw new Error(`bad model key: ${key}`);
    if (!entry || typeof entry !== 'object' || typeof entry.url !== 'string' || !entry.url) throw new Error(`model ${key} needs a url`);
    for (const f of NUMBER_FIELDS) {
      if (entry[f] !== undefined && !Number.isFinite(entry[f])) throw new Error(`model ${key}: ${f} must be a number`);
    }
    if (entry.scale !== undefined && entry.scale <= 0) throw new Error(`model ${key}: scale must be positive`);
    models[key] = { ...entry, override: true };
  }
  const rules = [];
  for (const [i, rule] of (doc.rules ?? []).entries()) {
    if (!rule || !KINDS.has(rule.kind)) throw new Error(`rule ${i}: bad kind`);
    if (typeof rule.id !== 'string') throw new Error(`rule ${i}: id pattern required`);
    try {
      new RegExp(rule.id);
    } catch {
      throw new Error(`rule ${i}: invalid id pattern`);
    }
    if (typeof rule.model !== 'string' || !ID.test(rule.model)) throw new Error(`rule ${i}: bad model key`);
    if (rule.scale !== undefined && !(Number.isFinite(rule.scale) && rule.scale > 0)) throw new Error(`rule ${i}: scale must be positive`);
    rules.push({ kind: rule.kind, id: rule.id, model: rule.model, ...(rule.scale !== undefined ? { scale: rule.scale } : {}), ...(rule.tint ? { tint: true } : {}), override: true });
  }
  return { models, rules };
}

export function editorPlugin({ root, overridesPath = join(root, 'public/data/appearance.local.json') } = {}) {
  return {
    name: 'cdda-model-studio',
    configureServer(server) {
      server.middlewares.use('/api/editor/overrides', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const doc = existsSync(overridesPath) ? JSON.parse(await readFile(overridesPath, 'utf8')) : { models: {}, rules: [] };
            return send(res, 200, validateOverrides(doc));
          }
          if (req.method === 'PUT') {
            const doc = validateOverrides(JSON.parse(await readBody(req)));
            await mkdir(dirname(overridesPath), { recursive: true });
            const tmp = `${overridesPath}.tmp`;
            await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
            await rename(tmp, overridesPath);
            return send(res, 200, doc);
          }
          send(res, 405, { error: 'method not allowed' });
        } catch (error) {
          send(res, 400, { error: error.message });
        }
      });
    },
  };
}
