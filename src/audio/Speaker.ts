import * as THREE from 'three';

export const SPEAKER_RING_RADIUS = 10;
const SPEAKER_COLORS = [0xff4466, 0xffaa44, 0x44ff88, 0x44aaff, 0xaa66ff];

export class Speaker {
  context: AudioContext;
  panner: PannerNode;
  channelGain: GainNode;
  azimuth: number;
  index: number;
  color: number;

  group = new THREE.Group();
  box: THREE.Mesh;
  frustum: THREE.Mesh;

  constructor(context: AudioContext, destination: AudioNode, azimuth: number, index: number) {
    this.context = context;
    this.azimuth = azimuth;
    this.index = index;
    this.color = SPEAKER_COLORS[index % SPEAKER_COLORS.length];

    this.channelGain = context.createGain();
    this.channelGain.gain.value = 1;

    this.panner = context.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;

    const x = Math.cos(azimuth) * SPEAKER_RING_RADIUS;
    const z = Math.sin(azimuth) * SPEAKER_RING_RADIUS;
    const y = 0.25;
    this.panner.positionX.value = x;
    this.panner.positionY.value = y;
    this.panner.positionZ.value = z;

    const inward = new THREE.Vector3(-x, 0, -z).normalize();
    this.panner.orientationX.value = inward.x;
    this.panner.orientationY.value = inward.y;
    this.panner.orientationZ.value = inward.z;
    this.panner.coneInnerAngle = 60;
    this.panner.coneOuterAngle = 180;
    this.panner.coneOuterGain = 0.4;

    this.channelGain.connect(this.panner).connect(destination);

    this.box = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 0.4 }),
    );
    this.box.position.set(x, y, z);

    const frustumLength = 6;
    const frustumGeom = new THREE.ConeGeometry(1.5, frustumLength, 24, 1, true);
    frustumGeom.translate(0, -frustumLength / 2, 0);
    const frustumMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.frustum = new THREE.Mesh(frustumGeom, frustumMat);
    this.frustum.position.set(x, y, z);
    this.frustum.lookAt(0, 3, 0);
    this.frustum.rotateX(-Math.PI / 2);

    this.group.add(this.box);
    this.group.add(this.frustum);
  }

  setGain(v: number) { this.channelGain.gain.value = v; }
  setMuted(m: boolean) { this.channelGain.gain.value = m ? 0 : 1; }
  input(): AudioNode { return this.channelGain; }

  updateVisual() {
    const g = this.channelGain.gain.value;
    const scale = 0.5 + g * 1.5;
    this.frustum.scale.set(scale, 1, scale);
    (this.frustum.material as THREE.MeshBasicMaterial).opacity = 0.05 + g * 0.2;
  }

  dispose() {
    this.box.geometry.dispose();
    (this.box.material as THREE.Material).dispose();
    this.frustum.geometry.dispose();
    (this.frustum.material as THREE.Material).dispose();
  }
}
