import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';
import { DomeProjection } from './app/DomeProjection';

const canvas = document.createElement('canvas');
canvas.id = 'view';
document.querySelector<HTMLDivElement>('#app')!.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.position.set(18, 12, 18);
camera.lookAt(0, EYE_HEIGHT, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 2, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const projection = new DomeProjection(1024);
const dome = new DomeScene(projection.material);

// Temporary test content so we can see the projection working before real templates land.
{
  const s = dome.templateScene;
  s.background = new THREE.Color(0x111133);
  s.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 10, 5);
  s.add(dl);
  const colors = [0xff4466, 0x44ff66, 0x4466ff, 0xffdd44, 0xff44ff, 0x44ffff];
  colors.forEach((c, i) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: c }),
    );
    const a = (i / colors.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 4, 1 + Math.sin(a) * 0.5, Math.sin(a) * 4);
    s.add(m);
  });
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();
function tick() {
  const dt = clock.getDelta();
  void dt;
  controls.update();

  dome.dome.visible = false;
  projection.render(renderer, dome.templateScene);
  dome.dome.visible = true;

  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();
