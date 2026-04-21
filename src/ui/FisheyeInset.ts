import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import * as TSL from 'three/tsl';

type AnyRenderer = THREE.WebGLRenderer | WebGPURenderer;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, vec3, vec4, float, sin, cos, atan, length,
  uv, positionLocal, Discard, cubeTexture,
} = T;

const INSET_SIZE = 256;
const INSET_MARGIN = 16;

export class FisheyeInset {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: NodeMaterial;
  private quad: THREE.Mesh;
  private frame: HTMLDivElement;
  private visible = true;

  constructor(cubeTex: THREE.CubeTexture) {
    this.mat = new NodeMaterial();
    this.mat.transparent = true;
    this.mat.depthWrite = false;
    this.mat.depthTest = false;

    // Fullscreen quad: PlaneGeometry(2,2) positions already span NDC xy.
    this.mat.vertexNode = vec4(positionLocal.xy, float(0.0), float(1.0));

    this.mat.colorNode = Fn(() => {
      const p = uv().mul(2.0).sub(1.0);
      const r = length(p);
      Discard(r.greaterThan(float(1.0)));

      const theta = r.mul(float(1.5707963));
      const phi = atan(p.y, p.x);
      const dir = vec3(
        sin(theta).mul(cos(phi)),
        cos(theta),
        sin(theta).mul(sin(phi)),
      );
      return vec4(cubeTexture(cubeTex, dir).rgb, float(1.0));
    })();

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.frame = document.createElement('div');
    this.frame.id = 'fisheye-frame';
    document.body.appendChild(this.frame);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.frame.style.display = v ? 'block' : 'none';
  }

  render(renderer: AnyRenderer) {
    if (!this.visible) return;

    const prevScissorTest = renderer.getScissorTest();
    const prevScissor = new THREE.Vector4();
    renderer.getScissor(prevScissor);
    const prevViewport = new THREE.Vector4();
    renderer.getViewport(prevViewport);
    const prevAutoClear = renderer.autoClear;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const x = size.x - INSET_SIZE - INSET_MARGIN;
    const y = INSET_MARGIN;

    renderer.setScissorTest(true);
    renderer.setViewport(x, y, INSET_SIZE, INSET_SIZE);
    renderer.setScissor(x, y, INSET_SIZE, INSET_SIZE);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);

    renderer.setViewport(prevViewport);
    renderer.setScissor(prevScissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.quad.geometry.dispose();
    this.mat.dispose();
    this.frame.remove();
  }
}
