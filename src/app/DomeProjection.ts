import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

// TSL types are strict about float/vec coercions; the runtime is permissive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, uniform, vec2, vec3, vec4, float, mix, normalize,
  positionWorld, cubeTexture, texture, atan, acos,
} = T;

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;

// Shared direction computation for a point on the dome surface.
// Hemisphere mode: sample direction equals surface direction (upper 180° of scene).
// Fulldome mode: double polar angle from zenith so the whole 0..π latitude range
// of the source compresses into 0..π/2 on the dome.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function domeDirectionNode(uProjectionMode: any) {
  const dirH = normalize(positionWorld);
  const y = dirH.y;
  const twoY = y.mul(2.0);
  // Double-angle identities: cos(2θ) = 2y² - 1; sin(2θ)/sin(θ) = 2y.
  const dirFD = vec3(
    dirH.x.mul(twoY),
    y.mul(y).mul(2.0).sub(1.0),
    dirH.z.mul(twoY),
  );
  return mix(dirH, dirFD, uProjectionMode);
}

export class DomeMaterial extends NodeMaterial {
  uProjectionMode = uniform(0.0);

  constructor(cubeTex: THREE.CubeTexture) {
    super();
    this.side = THREE.DoubleSide;

    const { uProjectionMode } = this;

    this.colorNode = Fn(() => {
      const dir = domeDirectionNode(uProjectionMode);
      return vec4(cubeTexture(cubeTex, dir).rgb, float(1.0));
    })();
  }

  setProjectionMode(m: 'hemisphere' | 'fulldome') {
    this.uProjectionMode.value = m === 'fulldome' ? 1.0 : 0.0;
  }
}

// Samples an equirectangular texture directly from the dome surface, bypassing
// the cube-map roundtrip (no face-boundary seams, no resolution down-sampling).
export class DomeMaterialEquirect extends NodeMaterial {
  uProjectionMode = uniform(0.0);

  constructor(equirectTex: THREE.Texture) {
    super();
    this.side = THREE.DoubleSide;

    const { uProjectionMode } = this;

    this.colorNode = Fn(() => {
      const dir = domeDirectionNode(uProjectionMode);
      // Inverted-sphere equirect convention: u = atan2(z, x)/2π, v = 1 - acos(y)/π.
      const u = atan(dir.z, dir.x).div(TWO_PI);
      const v = acos(dir.y).div(PI).oneMinus();
      return vec4(texture(equirectTex, vec2(u, v)).rgb, float(1.0));
    })();
  }

  setProjectionMode(m: 'hemisphere' | 'fulldome') {
    this.uProjectionMode.value = m === 'fulldome' ? 1.0 : 0.0;
  }
}
