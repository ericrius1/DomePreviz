import * as THREE from 'three';

export const DOME_RADIUS = 10;
export const EYE_HEIGHT = 1.6;

export class DomeScene {
  outerScene = new THREE.Scene();
  templateScene = new THREE.Scene();
  dome: THREE.Mesh;
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  radius: number;

  constructor(domeMaterial: THREE.Material, radius: number = DOME_RADIUS) {
    this.radius = radius;
    this.outerScene.background = new THREE.Color(0x0a0a0f);

    this.dome = new THREE.Mesh(this.makeDomeGeom(radius), domeMaterial);
    this.outerScene.add(this.dome);

    const floorMat = new THREE.MeshBasicMaterial({ color: 0x1a1a22 });
    this.floor = new THREE.Mesh(this.makeFloorGeom(radius), floorMat);
    this.outerScene.add(this.floor);

    this.grid = this.makeGrid(radius);
    this.outerScene.add(this.grid);

    this.outerScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5);
    dl.position.set(5, 10, 5);
    this.outerScene.add(dl);
  }

  setRadius(radius: number) {
    if (radius === this.radius) return;
    this.radius = radius;

    this.dome.geometry.dispose();
    this.dome.geometry = this.makeDomeGeom(radius);

    this.floor.geometry.dispose();
    this.floor.geometry = this.makeFloorGeom(radius);

    this.outerScene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.grid = this.makeGrid(radius);
    this.outerScene.add(this.grid);
  }

  private makeDomeGeom(radius: number) {
    return new THREE.SphereGeometry(radius, 96, 64, 0, Math.PI * 2, 0, Math.PI / 2);
  }

  private makeFloorGeom(radius: number) {
    const g = new THREE.CircleGeometry(radius, 64);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  private makeGrid(radius: number) {
    const grid = new THREE.GridHelper(radius * 2, 20, 0x333344, 0x22222a);
    (grid.material as THREE.Material).opacity = 0.4;
    (grid.material as THREE.Material).transparent = true;
    return grid;
  }
}
