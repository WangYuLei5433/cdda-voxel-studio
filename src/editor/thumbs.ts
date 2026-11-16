// Thumbnails for the grid view: each object built exactly as the stage shows it
// (src/editor/subject.ts), rendered once off-screen from the
// stage's three-quarter view and cached as an image. Only cells that scroll into view are
// rendered, one at a time, so a branch with thousands of objects never blocks the page.
import * as THREE from 'three';

import type { Subject } from './subject';

const SIZE = 160;
const DIR = new THREE.Vector3(0.75, 0.6, 1).normalize();

export type Build = () => Promise<Subject>;

export class ThumbnailCache {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
  private readonly done = new Map<string, string | null>();
  private readonly waiting = new Map<string, { build: Build; resolve: (url: string | null) => void }>();
  private running = false;
  /** Bumped when the cache is cleared, so renders started before are dropped. */
  private generation = 0;

  constructor() {
    // The stage's lighting (src/editor/stage.ts), without shadows.
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2418, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
  }

  /** Cached image (data URL), `null` for objects that draw nothing, `undefined` when not made yet. */
  peek(key: string): string | null | undefined {
    return this.done.get(key);
  }

  /** Queue a render; resolves with the image, or null when the object draws nothing. */
  request(key: string, build: Build): Promise<string | null> {
    if (this.done.has(key)) return Promise.resolve(this.done.get(key)!);
    const old = this.waiting.get(key);
    return new Promise((resolve) => {
      this.waiting.set(key, { build, resolve: (url) => (old?.resolve(url), resolve(url)) });
      void this.pump();
    });
  }

  /** Drop a queued render that is no longer needed (its cell scrolled away). */
  cancel(key: string): void {
    this.waiting.delete(key);
  }

  /** Forget every image (after an edit changes how objects look). */
  clear(): void {
    this.done.clear();
    this.generation++;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.waiting.size) {
        // Newest request first: the cells the user is looking at now.
        const key = [...this.waiting.keys()].at(-1)!;
        const job = this.waiting.get(key)!;
        this.waiting.delete(key);
        const gen = this.generation;
        let url: string | null = null;
        try {
          url = this.render(await job.build());
        } catch (err) {
          console.warn('[editor] thumbnail failed', key, err);
        }
        if (gen === this.generation) this.done.set(key, url);
        job.resolve(url);
        await new Promise(requestAnimationFrame);
      }
    } finally {
      this.running = false;
    }
  }

  private render(subject: Subject): string | null {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(SIZE, SIZE, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const root = new THREE.Group();
    root.add(subject.object);
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o, true);
    });
    let url: string | null = null;
    if (!box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.05);
      const dist = (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.02;
      this.camera.position.copy(sphere.center).addScaledVector(DIR, dist);
      this.camera.near = dist / 100;
      this.camera.far = dist * 4;
      this.camera.lookAt(sphere.center);
      this.camera.updateProjectionMatrix();
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      url = this.renderer.domElement.toDataURL('image/png');
    }
    this.scene.remove(root);
    return url;
  }
}
