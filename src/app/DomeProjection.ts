import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

// TSL types are strict about float/vec coercions; the runtime is permissive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, uniform, vec3, vec4, float, mix, normalize,
  positionWorld, cubeTexture,
} = T;

export class DomeMaterial extends NodeMaterial {
  // 0 = hemisphere (physical dome: upper 180° of scene),
  // 1 = fulldome (squash full 360° scene into hemisphere by doubling polar angle).
  uProjectionMode = uniform(0.0);

  constructor(cubeTex: THREE.CubeTexture) {
    super();
    this.side = THREE.DoubleSide;

    const { uProjectionMode } = this;

    this.colorNode = Fn(() => {
      // Hemisphere: sample cube in the dome point's world direction.
      const dirH = normalize(positionWorld);

      // Fulldome squash: double polar angle from zenith so latitude 0..π/2 → 0..π.
      // Using double-angle identities (y is the cosine of the polar angle):
      //   cos(2θ) = 2y² - 1
      //   new xz = xz · (sin(2θ)/sin(θ)) = xz · 2y
      // Resulting vector is already unit-length.
      const y = dirH.y;
      const twoY = y.mul(2.0);
      const dirFD = vec3(
        dirH.x.mul(twoY),
        y.mul(y).mul(2.0).sub(1.0),
        dirH.z.mul(twoY),
      );

      const dir = mix(dirH, dirFD, uProjectionMode);
      const col = cubeTexture(cubeTex, dir).rgb;
      return vec4(col, float(1.0));
    })();
  }

  setProjectionMode(m: 'hemisphere' | 'fulldome') {
    this.uProjectionMode.value = m === 'fulldome' ? 1.0 : 0.0;
  }
}
