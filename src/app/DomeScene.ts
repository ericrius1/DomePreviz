import * as THREE from 'three';

export const DOME_RADIUS = 10;
export const EYE_HEIGHT = 1.6;

export class DomeScene {
  outerScene = new THREE.Scene();
  templateScene = new THREE.Scene();
  dome: THREE.Mesh;
  floor: THREE.Mesh;
  grid: THREE.GridHelper;

  constructor(domeMaterial: THREE.Material) {
    this.outerScene.background = new THREE.Color(0x0a0a0f);

    const domeGeom = new THREE.SphereGeometry(
      DOME_RADIUS, 96, 64, 0, Math.PI * 2, 0, Math.PI / 2,
    );
    this.dome = new THREE.Mesh(domeGeom, domeMaterial);
    this.outerScene.add(this.dome);

    const floorGeom = new THREE.CircleGeometry(DOME_RADIUS, 64);
    floorGeom.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
    this.floor = new THREE.Mesh(floorGeom, floorMat);
    this.outerScene.add(this.floor);

    this.grid = new THREE.GridHelper(DOME_RADIUS * 2, 20, 0x333344, 0x22222a);
    (this.grid.material as THREE.Material).opacity = 0.4;
    (this.grid.material as THREE.Material).transparent = true;
    this.outerScene.add(this.grid);
  }
}
