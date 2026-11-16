// The editor's 3D stage: one object shown exactly as the game places it, on a tile grid,
// next to a wall segment at the game's wall height and a person at the game's person height.
// Sizes come from the same code the game uses (ModelLibrary.staticParts + the map layer's
// placement scale; the creature plan for monsters), so the measured size is the in-game size.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { Appearance } from '../render/appearance';
import type { ModelInstance, ModelLibrary } from '../render/models';
import { copyMaterial, type TextureLibrary } from '../render/textures';
import { wallPartGeometry, WALL_THICKNESS } from '../render/wall-geometry';
import { WORLD } from '../render/world-scale';

export type View = 'iso' | 'front' | 'side' | 'top';

export interface StageOptions {
  grid: boolean;
  wall: boolean;
  person: boolean;
  bbox: boolean;
  wireframe: boolean;
}

/** What the stage measured on the shown object, in tiles. */
export interface Measure {
  width: number;
  depth: number;
  height: number;
  /** Lowest point (negative: sinks into the ground). */
  bottom: number;
}

const GRID = 9;


export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.02, 400);
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly grid = new THREE.Group();
  private readonly wall = new THREE.Group();
  private readonly person = new THREE.Group();
  private readonly subjectRoot = new THREE.Group();
  private readonly bboxHelper = new THREE.Box3Helper(new THREE.Box3(), 0xff9f1c);
  private actor: ModelInstance | null = null;
  private personActor: ModelInstance | null = null;
  private subjectBox = new THREE.Box3();
  options: StageOptions = { grid: true, wall: true, person: true, bbox: true, wireframe: false };
  /** Called after each frame (tests read the renderer's state). */
  onFrame: (() => void) | null = null;
  frames = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    appearance: Appearance,
    readonly models: ModelLibrary,
    readonly textures: TextureLibrary,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x9da3a6);
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2418, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 60 });
    this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.bboxHelper.visible = false;
    this.scene.add(this.grid, this.wall, this.person, this.subjectRoot, this.bboxHelper);
    this.buildGrid();
    this.buildWall();
    void this.buildPerson();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement ?? canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.actor?.update(dt);
    this.personActor?.update(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.onFrame?.();
  }

  /** One-tile checkerboard with tile lines; the centre tile (0, 0) is where objects stand. */
  private buildGrid(): void {
    const half = (GRID - 1) / 2;
    const light = new THREE.MeshStandardMaterial({ color: 0x8a8d84, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x7d8078, roughness: 1 });
    const centre = new THREE.MeshStandardMaterial({ color: 0x95a08a, roughness: 1 });
    const tile = new THREE.BoxGeometry(1, 0.04, 1).translate(0, -0.02, 0);
    for (let x = -half; x <= half; x++) {
      for (let z = -half; z <= half; z++) {
        const m = new THREE.Mesh(tile, x === 0 && z === 0 ? centre : (x + z) % 2 ? dark : light);
        m.position.set(x, 0, z);
        m.receiveShadow = true;
        this.grid.add(m);
      }
    }
    const lines = new THREE.GridHelper(GRID, GRID, 0x3d4a3a, 0x5c6158);
    lines.position.set(0, 0.002, 0);
    (lines.material as THREE.Material).depthWrite = false;
    this.grid.add(lines);
  }

  /** A three-tile wall run with the game's thin-wall geometry and height. */
  private buildWall(): void {
    const material = this.textures.surface('plaster_wall') ?? new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
    for (let i = -1; i <= 1; i++) {
      for (const part of ['post', 'armPos', 'armNeg'] as const) {
        const m = new THREE.Mesh(wallPartGeometry(part, WORLD.wallHeight), material);
        m.castShadow = m.receiveShadow = true;
        // Runs along z (rotY −π/2), like a west wall of a room.
        m.rotation.y = -Math.PI / 2;
        m.position.set(0, 0, i);
        this.wall.add(m);
      }
    }
  }

  /** The reference person: a capsule at the person height. */
  private async buildPerson(): Promise<void> {
    const h = WORLD.personHeight;
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.13, h * 0.74, 6, 12), new THREE.MeshStandardMaterial({ color: 0x5a7bb0, roughness: 0.8 }));
    capsule.position.y = h / 2;
    capsule.castShadow = true;
    this.person.add(capsule);
  }

  /** Clear the shown object. */
  clear(): void {
    for (const c of [...this.subjectRoot.children]) this.subjectRoot.remove(c);
    this.subjectRoot.scale.set(1, 1, 1);
    this.subjectRoot.rotation.set(0, 0, 0);
    this.actor = null;
    this.subjectBox.makeEmpty();
    this.bboxHelper.visible = false;
  }

  /** Show a static object at the tile centre (already transformed as the game places it). */
  show(object: THREE.Object3D, actor: ModelInstance | null = null, rootScale: [number, number, number] = [1, 1, 1]): Measure {
    this.clear();
    this.subjectRoot.scale.set(...rootScale);
    this.subjectRoot.add(object);
    this.actor = actor;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Own materials, so the wireframe switch never touches cached ones (keeping shader hooks).
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
    });
    const measured = this.measure();
    this.applyOptions();
    return measured;
  }

  /** Measure the shown object (skinned meshes in their current pose). */
  measure(): Measure {
    this.subjectRoot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.subjectRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o, true);
    });
    this.subjectBox = box;
    this.bboxHelper.box.copy(box);
    this.bboxHelper.visible = this.options.bbox && !box.isEmpty();
    this.layoutReferences();
    if (box.isEmpty()) return { width: 0, depth: 0, height: 0, bottom: 0 };
    const size = box.getSize(new THREE.Vector3());
    return { width: size.x, depth: size.z, height: size.y, bottom: box.min.y };
  }

  /** Keep the wall and the person beside the object, whatever its size. */
  private layoutReferences(): void {
    const box = this.subjectBox.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : this.subjectBox;
    this.wall.position.set(Math.floor(Math.min(box.min.x, -0.5)) - 1 + WALL_THICKNESS / 2, 0, 0);
    this.person.position.set(Math.ceil(Math.max(box.max.x, 0.5)) + 0.6, 0, 0.2);
  }

  setOptions(patch: Partial<StageOptions>): void {
    Object.assign(this.options, patch);
    this.applyOptions();
  }

  private applyOptions(): void {
    this.grid.visible = this.options.grid;
    this.wall.visible = this.options.wall;
    this.person.visible = this.options.person;
    this.bboxHelper.visible = this.options.bbox && !this.subjectBox.isEmpty();
    this.subjectRoot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if ('wireframe' in m) (m as THREE.MeshStandardMaterial).wireframe = this.options.wireframe;
      }
    });
  }

  /** Frame the object and the references from a preset direction. */
  view(view: View): void {
    const box = this.subjectBox.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : this.subjectBox.clone();
    if (this.options.wall) box.expandByObject(this.wall);
    if (this.options.person) box.expandByPoint(this.person.position.clone().setY(WORLD.personHeight));
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.6);
    const distance = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 1.05;
    const dir = { iso: new THREE.Vector3(0.75, 0.6, 1), front: new THREE.Vector3(0, 0.12, 1), side: new THREE.Vector3(1, 0.12, 0), top: new THREE.Vector3(0, 1, 0.0001) }[view].normalize();
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(dir, distance);
    this.camera.near = Math.max(0.01, distance / 200);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** The animated object (monsters), to switch animations. */
  get animated(): ModelInstance | null {
    return this.actor;
  }

  /** Picture of the canvas (for thumbnails / tests). */
  snapshot(): string {
    return this.canvas.toDataURL('image/png');
  }
}
