import * as THREE from 'three';
import type { Template, AudioBusLike } from './Template';

export class NullTemplate implements Template {
  id = 'planetarium' as const;
  private group = new THREE.Group();
  private t = 0;

  init(scene: THREE.Scene, _bus: AudioBusLike): void {
    scene.background = new THREE.Color(0x0b0b1a);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9);
    dl.position.set(5, 10, 5);
    scene.add(dl);

    const colors = [0xff4466, 0x44ff66, 0x4466ff, 0xffdd44, 0xff44ff, 0x44ffff];
    colors.forEach((c, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({ color: c }),
      );
      const a = (i / colors.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 4, 1.5 + Math.sin(a) * 0.5, Math.sin(a) * 4);
      m.userData.baseY = m.position.y;
      m.userData.phase = a;
      this.group.add(m);
    });
    scene.add(this.group);
  }

  update(dt: number, _time: number): void {
    this.t += dt;
    this.group.children.forEach((c, i) => {
      c.rotation.y += dt * 0.5;
      const phase = (c.userData.phase as number) ?? i;
      c.position.y = (c.userData.baseY as number) + Math.sin(this.t * 1.2 + phase) * 0.25;
    });
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) (m as THREE.Material).dispose();
    });
  }

  getParams() { return {}; }
}
