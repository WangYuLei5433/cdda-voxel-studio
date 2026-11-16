import { defineConfig } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { editorPlugin } from './tools/editor/vite-plugin.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [editorPlugin({ root: ROOT })],
  optimizeDeps: {
    include: ['three', 'three/examples/jsm/controls/OrbitControls.js'],
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
  },
  build: { target: 'es2022' },
});
