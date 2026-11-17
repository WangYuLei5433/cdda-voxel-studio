// Dev-server endpoints for the studio (index.html):
//   GET /api/voxel/sets        → names of the voxel sets under vendor/voxel/ (folders with voxelset.json)
//   GET /voxel/<set>/<file>    → a file of one of those sets
//   GET /api/mesh/sets         → names of the mesh sets under vendor/mesh/ (folders with meshset.json)
//   GET /mesh/<set>/<file>     → a file of one of those sets (.glb, .gltf + .bin, .obj + .mtl, textures)
// The CDDA object catalog is a static file (public/data/cdda, tools/editor/catalog.mjs --write).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
};

/** The two endpoints of one kind of set: the list of set folders, and their files. */
function serveSets(server, { dir, manifest, list, files }) {
  server.middlewares.use(list, (req, res) => {
    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    // statSync follows symlinks: a set may be a link to a library checked out elsewhere.
    const sets = existsSync(dir) ? readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory() && existsSync(join(dir, name, manifest))).sort() : [];
    send(res, 200, sets);
  });
  server.middlewares.use(files, async (req, res) => {
    // Only files inside <dir>/<set>/.
    const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[/\\]+/, '');
    const file = join(dir, rel);
    if (req.method !== 'GET' || !file.startsWith(dir + sep) || rel.split(/[/\\]/).includes('..') || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: 'not found' });
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  });
}

export function editorPlugin({ root } = {}) {
  return {
    name: 'cdda-model-studio',
    configureServer(server) {
      serveSets(server, { dir: join(root, 'vendor/voxel'), manifest: 'voxelset.json', list: '/api/voxel/sets', files: '/voxel' });
      serveSets(server, { dir: join(root, 'vendor/mesh'), manifest: 'meshset.json', list: '/api/mesh/sets', files: '/mesh' });
    },
  };
}
