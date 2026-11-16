// Material textures (CC0, public/assets/textures) for the map: floors, walls, and a detail
// layer over models. Mapping is triplanar in world space, so tiles join seamlessly and any
// geometry (boxes, glTF props) can take a texture without UVs made for it.
//   surface: the texture is the color (× the instance tint) — floors, walls.
//   detail:  the model keeps its own colors; the texture's luminance adds grain — props.
import * as THREE from 'three';
import { WORLD } from './world-scale';

export interface TextureEntry {
  url: string;
  /** World units (tiles) covered by one repeat of the texture. */
  scale?: number;
  mode?: 'tile' | 'face' | 'uv';
  /** Atlas offset and size in bottom-left UV coordinates. */
  rect?: [number, number, number, number];
}

const loader = new THREE.TextureLoader();

/**
 * Copy a material keeping its shader hooks. Material.clone() drops onBeforeCompile and
 * customProgramCacheKey, which carry the triplanar / atlas / detail mapping below: a plain
 * clone of an atlas surface spreads the whole atlas over the face.
 */
export function copyMaterial<M extends THREE.Material>(m: M): M {
  const copy = m.clone() as M;
  if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) copy.onBeforeCompile = m.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) copy.customProgramCacheKey = m.customProgramCacheKey;
  return copy;
}

function triplanar(material: THREE.MeshStandardMaterial, scale: number, entry?: TextureEntry): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: 1 / scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          mat4 triModel = modelMatrix;
          #ifdef USE_INSTANCING
            triModel = modelMatrix * instanceMatrix;
          #endif
          vTriPos = (triModel * vec4(transformed, 1.0)).xyz;
          vTriNormal = normalize(mat3(triModel) * objectNormal);
        }`,
      );
    if (entry?.mode) {
      shader.uniforms.uWallHeight = { value: WORLD.wallHeight };
      shader.uniforms.uAtlasRect = { value: new THREE.Vector4(...(entry.rect ?? [0, 0, 1, 1])) };
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform float uTriScale;\nuniform float uWallHeight;\nuniform vec4 uAtlasRect;').replace('#include <map_fragment>', `
        vec3 n = abs(normalize(vTriNormal));
        vec2 atlasUv = ${entry.mode === 'uv' ? 'vMapUv' : entry.mode === 'tile' ? 'fract(vTriPos.xz + 0.5)' : 'vec2(vMapUv.x, clamp(vTriPos.y / uWallHeight, 0.0, 1.0))'};
        vec4 atlasColor = texture2D(map, uAtlasRect.xy + atlasUv * uAtlasRect.zw);
        diffuseColor *= atlasColor;
        ${entry.mode === 'face' ? 'if (n.y > 0.5) diffuseColor.rgb *= 0.35;' : ''}
      `);
      return;
    }
    const sample = `
      vec3 triW = pow(abs(normalize(vTriNormal)), vec3(4.0));
      triW /= (triW.x + triW.y + triW.z);
      vec3 triP = vTriPos * uTriScale;
      vec4 triColor = texture2D(map, triP.zy) * triW.x + texture2D(map, triP.xz) * triW.y + texture2D(map, triP.xy) * triW.z;`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform float uTriScale;')
      .replace('#include <map_fragment>', `${sample}\n diffuseColor *= triColor;`);
  };
  // Distinct program per mode/scale (onBeforeCompile is not part of the default cache key).
  material.customProgramCacheKey = () => `tri-${scale}-${entry?.mode ?? 'blend'}`;
}

export class TextureLibrary {
  private readonly entries = new Map<string, TextureEntry>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly surfaces = new Map<string, THREE.MeshStandardMaterial>();
  private readonly details = new Map<string, THREE.Material>();

  constructor(entries: Record<string, TextureEntry>) {
    for (const [k, e] of Object.entries(entries)) this.entries.set(k, e);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  private texture(key: string): THREE.Texture | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    let tex = this.textures.get(entry.url);
    if (!tex) {
      tex = loader.load(entry.url);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.textures.set(entry.url, tex);
    }
    return tex;
  }

  /** Material for textured floors/walls (instance colors tint it). */
  surface(key: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial | null {
    const cacheKey = `${key}|${JSON.stringify(opts)}`;
    let m = this.surfaces.get(cacheKey);
    if (m) return m;
    const tex = this.texture(key);
    if (!tex) return null;
    m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...opts, map: tex });
    triplanar(m, this.entries.get(key)?.scale ?? 2, this.entries.get(key));
    this.surfaces.set(cacheKey, m);
    return m;
  }

  /** A model part's material with a detail texture layered over its own colors. */
  detail(base: THREE.Material, key: string): THREE.Material {
    if (!(base instanceof THREE.MeshStandardMaterial)) return base;
    const tex = this.texture(key);
    if (!tex) return base;
    const cacheKey = `${base.uuid}|${key}`;
    let m = this.details.get(cacheKey);
    if (!m) {
      const clone = base.clone();
      // Keep the model's own color map; the detail texture rides on a second sampler.
      const detailTex = tex;
      clone.onBeforeCompile = (shader) => {
        shader.uniforms.uDetailMap = { value: detailTex };
        shader.uniforms.uTriScale = { value: 1 / (this.entries.get(key)?.scale ?? 1) };
        shader.uniforms.uTriStrength = { value: 0.75 };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;')
          .replace(
            '#include <worldpos_vertex>',
            `#include <worldpos_vertex>
            {
              mat4 triModel = modelMatrix;
              #ifdef USE_INSTANCING
                triModel = modelMatrix * instanceMatrix;
              #endif
              vTriPos = (triModel * vec4(transformed, 1.0)).xyz;
              vTriNormal = normalize(mat3(triModel) * objectNormal);
            }`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNormal;\nuniform sampler2D uDetailMap;\nuniform float uTriScale;\nuniform float uTriStrength;',
          )
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            {
              vec3 triW = pow(abs(normalize(vTriNormal)), vec3(4.0));
              triW /= (triW.x + triW.y + triW.z);
              vec3 triP = vTriPos * uTriScale;
              vec3 d = texture2D(uDetailMap, triP.zy).rgb * triW.x + texture2D(uDetailMap, triP.xz).rgb * triW.y + texture2D(uDetailMap, triP.xy).rgb * triW.z;
              float lum = dot(d, vec3(0.299, 0.587, 0.114));
              diffuseColor.rgb *= mix(vec3(1.0), vec3(lum * 2.2), uTriStrength);
            }`,
          );
      };
      clone.customProgramCacheKey = () => `detail-${key}`;
      this.details.set(cacheKey, clone);
      m = clone;
    }
    return m;
  }
}
