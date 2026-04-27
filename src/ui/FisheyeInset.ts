import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { ProjectionMode, Video360SourceProjection } from '../types';

type AnyRenderer = THREE.WebGLRenderer | WebGPURenderer;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, uniform, vec2, vec3, vec4, float, mix, sin, cos, atan, acos, length,
  uv, positionLocal, Discard, cubeTexture, texture,
} = T;

const INSET_SIZE = 256;
const INSET_MARGIN = 16;
const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

export class FisheyeInset {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private cubeTex: THREE.CubeTexture;
  private mat: NodeMaterial;
  private quad: THREE.Mesh;
  private frame: HTMLDivElement;
  private visible = true;
  private uProjectionMode = uniform(0.0);
  private sourceTex: THREE.Texture | null = null;
  private sourceProjection: Video360SourceProjection | null = null;
  private prevScissor = new THREE.Vector4();
  private prevViewport = new THREE.Vector4();
  private renderSize = new THREE.Vector2();

  constructor(cubeTex: THREE.CubeTexture) {
    this.cubeTex = cubeTex;
    this.mat = this.buildMaterial();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.frame = document.createElement('div');
    this.frame.id = 'fisheye-frame';
    document.body.appendChild(this.frame);
  }

  private buildMaterial(): NodeMaterial {
    const m = new NodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.depthTest = false;
    m.vertexNode = vec4(positionLocal.xy, float(0.0), float(1.0));

    const { cubeTex, sourceTex, sourceProjection, uProjectionMode } = this;

    m.colorNode = Fn(() => {
      const p = uv().mul(2.0).sub(1.0);
      const r = length(p);
      Discard(r.greaterThan(float(1.0)));

      if (sourceTex && sourceProjection === 'fisheye') {
        return vec4(texture(sourceTex, uv()).rgb, float(1.0));
      }

      // theta scales by projection mode: hemisphere = r·π/2, fulldome = r·π.
      const theta = r.mul(mix(float(HALF_PI), float(PI), uProjectionMode));
      const phi = atan(p.y, p.x);
      const dir = vec3(
        sin(theta).mul(cos(phi)),
        cos(theta),
        sin(theta).mul(sin(phi)),
      );

      if (sourceTex && sourceProjection === 'equirect') {
        const u = atan(dir.z, dir.x).div(TWO_PI);
        const v = acos(dir.y).div(PI).oneMinus();
        return vec4(texture(sourceTex, vec2(u, v)).rgb, float(1.0));
      }
      return vec4(cubeTexture(cubeTex, dir).rgb, float(1.0));
    })();

    return m;
  }

  setProjectionMode(m: ProjectionMode) {
    this.uProjectionMode.value = m === 'fulldome' ? 1.0 : 0.0;
  }

  setSource(tex: THREE.Texture | null, projection: Video360SourceProjection | null) {
    if (this.sourceTex === tex && this.sourceProjection === projection) return;
    this.sourceTex = tex;
    this.sourceProjection = projection;
    const oldMat = this.mat;
    this.mat = this.buildMaterial();
    this.quad.material = this.mat;
    oldMat.dispose();
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.frame.style.display = v ? 'block' : 'none';
  }

  render(renderer: AnyRenderer) {
    if (!this.visible) return;

    const prevScissorTest = renderer.getScissorTest();
    renderer.getScissor(this.prevScissor);
    renderer.getViewport(this.prevViewport);
    const prevAutoClear = renderer.autoClear;

    renderer.getSize(this.renderSize);
    const x = this.renderSize.x - INSET_SIZE - INSET_MARGIN;
    const y = INSET_MARGIN;

    renderer.setScissorTest(true);
    renderer.setViewport(x, y, INSET_SIZE, INSET_SIZE);
    renderer.setScissor(x, y, INSET_SIZE, INSET_SIZE);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);

    renderer.setViewport(this.prevViewport);
    renderer.setScissor(this.prevScissor);
    renderer.setScissorTest(prevScissorTest);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.quad.geometry.dispose();
    this.mat.dispose();
    this.frame.remove();
  }
}
