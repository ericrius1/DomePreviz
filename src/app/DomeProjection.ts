import * as THREE from 'three';
import { EYE_HEIGHT } from './DomeScene';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform samplerCube uCube;
  uniform vec3 uCenter;
  uniform float uOpacity;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  void main() {
    vec3 dir = normalize(vWorldPos - uCenter);
    vec3 color = textureCube(uCube, dir).rgb;
    float facing = dot(normalize(vNormal), normalize(cameraPosition - vWorldPos));
    float exterior = step(facing, 0.0);
    float mul = mix(1.0, uOpacity, exterior);
    gl_FragColor = vec4(color * mul, 1.0);
  }
`;

export class DomeProjection {
  cubeRT: THREE.WebGLCubeRenderTarget;
  cubeCamera: THREE.CubeCamera;
  material: THREE.ShaderMaterial;

  constructor(resolution: number) {
    this.cubeRT = new THREE.WebGLCubeRenderTarget(resolution, {
      generateMipmaps: false,
      type: THREE.HalfFloatType,
    });
    this.cubeCamera = new THREE.CubeCamera(0.05, 2000, this.cubeRT);
    this.cubeCamera.position.set(0, EYE_HEIGHT, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCube: { value: this.cubeRT.texture },
        uCenter: { value: new THREE.Vector3(0, EYE_HEIGHT, 0) },
        uOpacity: { value: 0.55 },
      },
      side: THREE.DoubleSide,
    });
  }

  setOpacity(v: number) {
    this.material.uniforms.uOpacity.value = v;
  }

  setResolution(resolution: number) {
    const old = this.cubeRT;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(resolution, {
      generateMipmaps: false,
      type: THREE.HalfFloatType,
    });
    this.cubeCamera.renderTarget = this.cubeRT;
    this.material.uniforms.uCube.value = this.cubeRT.texture;
    old.dispose();
  }

  render(renderer: THREE.WebGLRenderer, templateScene: THREE.Scene) {
    this.cubeCamera.update(renderer, templateScene);
  }

  dispose() {
    this.cubeRT.dispose();
    this.material.dispose();
  }
}
