import * as THREE from 'three';
import type { TemplateId, CameraMode } from '../types';

export interface XRActionHandlers {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
}

const TEMPLATE_LABELS: { id: TemplateId; color: number }[] = [
  { id: 'planetarium', color: 0x4466ff },
  { id: 'terrain',     color: 0xff8844 },
  { id: 'aurora',      color: 0x44ff99 },
  { id: 'video360',    color: 0x44ffaa },
];

const MODE_LABELS: { m: CameraMode; c: number }[] = [
  { m: 'orbit', c: 0xffffff },
  { m: 'first-person', c: 0xffaa00 },
];

export class XRControllers {
  group = new THREE.Group();
  private controllers: THREE.XRTargetRaySpace[] = [];
  private uiGroup = new THREE.Group();
  private buttons: { mesh: THREE.Mesh; onActivate: () => void }[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(renderer: { xr: { getController(index: number): THREE.XRTargetRaySpace } }, private actions: XRActionHandlers) {
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -5], 3));
      const ray = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      c.add(ray);
      c.addEventListener('selectstart', () => this.onSelect(c));
      this.controllers.push(c);
      this.group.add(c);
    }
    this.buildUI();
    this.group.add(this.uiGroup);
  }

  private buildUI() {
    this.uiGroup.position.set(0, 1.4, -1.5);

    TEMPLATE_LABELS.forEach((t, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.02),
        new THREE.MeshBasicMaterial({ color: t.color }),
      );
      m.position.set((i - (TEMPLATE_LABELS.length - 1) / 2) * 0.32, 0, 0);
      this.uiGroup.add(m);
      this.buttons.push({ mesh: m, onActivate: () => this.actions.onTemplateChange(t.id) });
    });

    MODE_LABELS.forEach((mo, i) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.02),
        new THREE.MeshBasicMaterial({ color: mo.c }),
      );
      m.position.set((i - 0.5) * 0.32, -0.2, 0);
      this.uiGroup.add(m);
      this.buttons.push({ mesh: m, onActivate: () => this.actions.onCameraModeChange(mo.m) });
    });
  }

  private onSelect(controller: THREE.XRTargetRaySpace) {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    controller.getWorldPosition(origin);
    direction.applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
    this.raycaster.set(origin, direction);
    const meshes = this.buttons.map((b) => b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const hitMesh = hits[0].object as THREE.Mesh;
      const btn = this.buttons.find((b) => b.mesh === hitMesh);
      btn?.onActivate();
    }
  }

  setVisible(v: boolean) { this.group.visible = v; }
}
