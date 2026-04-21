import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  uniform samplerCube uCube;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float theta = r * 1.5707963;
    float phi = atan(p.y, p.x);
    vec3 dir = vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
    gl_FragColor = vec4(textureCube(uCube, dir).rgb, 1.0);
  }
`;

const INSET_SIZE = 256;
const INSET_MARGIN = 16;

export class FisheyeInset {
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private frame: HTMLDivElement;
  private visible = true;

  constructor(initialCube?: THREE.CubeTexture) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uCube: { value: initialCube ?? null } },
      transparent: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.scene.add(this.quad);

    this.frame = document.createElement('div');
    this.frame.id = 'fisheye-frame';
    document.body.appendChild(this.frame);
  }

  setCubeTexture(tex: THREE.CubeTexture) {
    this.mat.uniforms.uCube.value = tex;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.frame.style.display = v ? 'block' : 'none';
  }

  render(renderer: THREE.WebGLRenderer) {
    if (!this.visible) return;
    if (!this.mat.uniforms.uCube.value) return;

    const prevScissorTest = renderer.getScissorTest();
    const prevScissor = new THREE.Vector4();
    renderer.getScissor(prevScissor);
    const prevViewport = new THREE.Vector4();
    renderer.getViewport(prevViewport);
    const prevAutoClear = renderer.autoClear;

    renderer.setScissorTest(true);
    renderer.setViewport(INSET_MARGIN, INSET_MARGIN, INSET_SIZE, INSET_SIZE);
    renderer.setScissor(INSET_MARGIN, INSET_MARGIN, INSET_SIZE, INSET_SIZE);
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
