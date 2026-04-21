import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DomeScene, EYE_HEIGHT } from './app/DomeScene';

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

// Placeholder dome material until Task 3 wires the cubemap shader.
const placeholderDomeMat = new THREE.MeshBasicMaterial({
  color: 0x66aadd,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
  side: THREE.DoubleSide,
});
const dome = new DomeScene(placeholderDomeMat);

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
  renderer.render(dome.outerScene, camera);
  requestAnimationFrame(tick);
}
tick();
