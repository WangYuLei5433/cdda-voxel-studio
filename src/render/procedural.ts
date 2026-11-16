// Procedural creature models for bodytypes no open asset covers (spiders, insects, crabs,
// snakes, fish, birds, blobs). Low-poly, tinted with the monster's CDDA color, with the same
// ModelInstance interface (idle / walk / attack / hit / die) as glTF creatures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { ClipRole, ModelInstance } from './models';

type Animate = (t: number, role: ClipRole, k: number) => void;

function mat(color: number, rough = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true });
}

function legs(root: THREE.Group, material: THREE.Material, count: number, spread: number, length: number): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const geo = new THREE.CylinderGeometry(0.02, 0.015, length, 4);
  geo.translate(0, -length / 2, 0);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const row = Math.floor(i / 2);
    const leg = new THREE.Mesh(geo, material);
    leg.position.set(side * 0.1, 0.18, (row - (count / 4 - 0.5)) * spread);
    leg.rotation.z = side * 1.0;
    leg.castShadow = true;
    root.add(leg);
    out.push(leg);
  }
  return out;
}

function build(shape: string, color: number): { root: THREE.Group; animate: Animate } {
  const root = new THREE.Group();
  const body = mat(color);
  const dark = mat(new THREE.Color(color).multiplyScalar(0.55).getHex());
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  switch (shape) {
    case 'spider':
    case 'insect': {
      const spider = shape === 'spider';
      const abdomen = add(new THREE.SphereGeometry(spider ? 0.2 : 0.14, 8, 6), body, 0, 0.22, -0.15);
      abdomen.scale.set(1, 0.8, spider ? 1.1 : 1.6);
      add(new THREE.SphereGeometry(0.11, 8, 6), dark, 0, 0.2, 0.1);
      const ls = legs(root, dark, spider ? 8 : 6, 0.1, spider ? 0.32 : 0.24);
      return {
        root,
        animate: (t, role) => {
          const speed = role === 'walk' ? 18 : 3;
          ls.forEach((l, i) => (l.rotation.x = Math.sin(t * speed + i) * (role === 'walk' ? 0.5 : 0.08)));
          abdomen.position.y = 0.22 + Math.sin(t * 4) * 0.01;
        },
      };
    }
    case 'crab': {
      const shell = add(new THREE.SphereGeometry(0.22, 8, 5), body, 0, 0.18, 0);
      shell.scale.set(1.3, 0.55, 1);
      const clawL = add(new THREE.BoxGeometry(0.1, 0.08, 0.16), dark, -0.24, 0.2, 0.18);
      const clawR = add(new THREE.BoxGeometry(0.1, 0.08, 0.16), dark, 0.24, 0.2, 0.18);
      const ls = legs(root, dark, 6, 0.09, 0.22);
      return {
        root,
        animate: (t, role) => {
          const snap = role === 'attack' ? Math.abs(Math.sin(t * 20)) * 0.5 : Math.sin(t * 2) * 0.1;
          clawL.rotation.y = snap;
          clawR.rotation.y = -snap;
          ls.forEach((l, i) => (l.rotation.x = Math.sin(t * (role === 'walk' ? 16 : 2) + i) * 0.3));
        },
      };
    }
    case 'snake': {
      const segs: THREE.Mesh[] = [];
      for (let i = 0; i < 7; i++) {
        const r = 0.08 - i * 0.007;
        segs.push(add(new THREE.SphereGeometry(r, 7, 5), i === 0 ? dark : body, 0, r, 0.3 - i * 0.1));
      }
      return {
        root,
        animate: (t, role) => {
          const speed = role === 'walk' ? 10 : 2;
          segs.forEach((s, i) => (s.position.x = Math.sin(t * speed - i * 0.9) * 0.08));
          if (role === 'attack') segs[0].position.y = 0.08 + Math.abs(Math.sin(t * 15)) * 0.15;
        },
      };
    }
    case 'fish': {
      const torso = add(new THREE.SphereGeometry(0.16, 8, 6), body, 0, 0.18, 0);
      torso.scale.set(0.6, 0.8, 1.6);
      const tail = add(new THREE.ConeGeometry(0.1, 0.18, 4), dark, 0, 0.18, -0.3);
      tail.rotation.x = Math.PI / 2;
      return {
        root,
        animate: (t) => {
          tail.rotation.y = Math.sin(t * 8) * 0.5;
          torso.position.y = 0.18 + Math.sin(t * 3) * 0.02;
        },
      };
    }
    case 'bird': {
      const torso = add(new THREE.SphereGeometry(0.12, 8, 6), body, 0, 0.3, 0);
      torso.scale.set(0.9, 0.9, 1.3);
      add(new THREE.SphereGeometry(0.07, 8, 6), body, 0, 0.42, 0.12);
      const beak = add(new THREE.ConeGeometry(0.03, 0.08, 4), mat(0xd8a030), 0, 0.42, 0.21);
      beak.rotation.x = Math.PI / 2;
      const wingGeo = new THREE.BoxGeometry(0.22, 0.02, 0.14);
      wingGeo.translate(0.11, 0, 0);
      const wl = new THREE.Mesh(wingGeo, dark);
      const wr = new THREE.Mesh(wingGeo, dark);
      wl.position.set(0.06, 0.32, 0);
      wr.position.set(-0.06, 0.32, 0);
      wr.rotation.y = Math.PI;
      root.add(wl, wr);
      return {
        root,
        animate: (t, role) => {
          const flap = Math.sin(t * (role === 'walk' || role === 'attack' ? 22 : 3)) * (role === 'idle' ? 0.15 : 0.8);
          wl.rotation.z = flap;
          wr.rotation.z = -flap;
        },
      };
    }
    default: {
      // blob / ooze / anything else: a wobbling translucent mass.
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, transparent: true, opacity: 0.85 });
      const mass = add(new THREE.IcosahedronGeometry(0.3, 1), m, 0, 0.22, 0);
      return {
        root,
        animate: (t, role) => {
          const w = role === 'walk' ? 8 : 3;
          mass.scale.set(1 + Math.sin(t * w) * 0.08, 0.75 - Math.sin(t * w) * 0.08, 1 + Math.cos(t * w) * 0.08);
        },
      };
    }
  }
}

export function proceduralCreature(shape: string, color: number, scale = 1): ModelInstance {
  const { root, animate } = build(shape, color);
  const wrapper = new THREE.Group();
  root.scale.setScalar(scale);
  wrapper.add(root);
  let t = 0;
  let role: ClipRole = 'idle';
  let roleTime = 0;
  return {
    object: wrapper,
    play(next) {
      role = next;
      roleTime = 0;
      if (next === 'die') root.rotation.z = Math.PI; // belly up
    },
    update(dt) {
      t += dt;
      roleTime += dt;
      // one-shot roles fall back to idle
      if (role !== 'idle' && role !== 'die' && roleTime > 0.5) role = 'idle';
      animate(t, role, roleTime);
    },
  };
}

/**
 * Static props generated in code (model url "procedural:<shape>"), as instancing parts.
 * bush: a rounded cluster of leafy low-poly balls (shrubs, plants, flowers).
 */
export function proceduralProp(shape: string): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] | null {
  if (shape !== 'bush') return null;
  const balls: [number, number, number, number][] = [
    [0, 0.2, 0, 0.24],
    [0.17, 0.15, 0.06, 0.18],
    [-0.15, 0.14, 0.08, 0.17],
    [0.04, 0.14, -0.17, 0.17],
    [-0.06, 0.32, -0.04, 0.16],
  ];
  const parts = balls.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z));
  const geometry = mergeGeometries(parts)!;
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x4f8f3f, roughness: 0.95, flatShading: true });
  return [{ geometry, material, matrix: new THREE.Matrix4() }];
}
