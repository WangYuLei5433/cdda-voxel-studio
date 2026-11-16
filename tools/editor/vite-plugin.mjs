// Dev-server endpoints for the studio (index.html):
//   GET /api/voxel/sets        → names of the voxel sets under vendor/voxel/ (folders with voxelset.json)
//   GET /voxel/<set>/<file>    → a file of one of those sets
// The CDDA object catalog is a static file (public/data/cdda, tools/editor/catalog.mjs --write).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function editorPlugin({ root } = {}) {
  const voxelRoot = join(root, 'vendor/voxel');
  return {
    name: 'cdda-model-studio',
    configureServer(server) {
      server.middlewares.use('/api/voxel/sets', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
        const sets = existsSync(voxelRoot) ? readdirSync(voxelRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(voxelRoot, d.name, 'voxelset.json'))).map((d) => d.name).sort() : [];
        send(res, 200, sets);
      });
      server.middlewares.use('/voxel', async (req, res) => {
        // Only files inside vendor/voxel/<set>/.
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[/\\]+/, '');
        const file = join(voxelRoot, rel);
        if (req.method !== 'GET' || !file.startsWith(voxelRoot + sep) || rel.split(/[/\\]/).includes('..') || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
        res.statusCode = 200;
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(await readFile(file));
      });
    },
  };
}
