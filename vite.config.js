import { defineConfig } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { editorPlugin } from './tools/editor/vite-plugin.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [editorPlugin({ root: ROOT })],
  optimizeDeps: {
    include: ['three', 'three/examples/jsm/controls/OrbitControls.js', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/utils/SkeletonUtils.js', 'three/examples/jsm/utils/BufferGeometryUtils.js'],
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
    // The studio writes this file and applies it itself (no page reload).
    watch: { ignored: ['**/public/data/appearance.local.json'] },
  },
  build: { target: 'es2022' },
});
