import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

// TSL types are strict about float/vec coercions; the runtime is permissive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, uniform, vec4, float, mix, step, dot, normalize,
  positionWorld, normalWorld, cameraPosition, cubeTexture,
} = T;

export class DomeMaterial extends NodeMaterial {
  uOpacity = uniform(0.55);

  constructor(cubeTex: THREE.CubeTexture) {
    super();
    this.side = THREE.DoubleSide;

    const { uOpacity } = this;

    this.colorNode = Fn(() => {
      const dir = normalize(positionWorld);
      const col = cubeTexture(cubeTex, dir).rgb;

      const view = normalize(cameraPosition.sub(positionWorld));
      const facing = dot(normalize(normalWorld), view);
      const exterior = step(facing, float(0.0));
      const mul = mix(float(1.0), uOpacity, exterior);

      return vec4(col.mul(mul), 1.0);
    })();
  }

  setOpacity(v: number) {
    this.uOpacity.value = v;
  }
}
