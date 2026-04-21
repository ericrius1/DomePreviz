import { Pane } from 'tweakpane';
import type { FolderApi, BindingApi } from '@tweakpane/core';
import type { AppState, Template, TemplateId, CameraMode } from '../types';
import type { AudioBus } from '../audio/AudioBus';
import type { DomeProjection } from '../app/DomeProjection';
import type { DomeScene } from '../app/DomeScene';

export interface TweakpaneUIActions {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onPresetSave: (slot: 1 | 2) => void;
  onPresetRecall: (slot: 1 | 2) => void;
}

export class TweakpaneUI {
  pane: Pane;
  private templateFolder: FolderApi;
  private currentTemplateBindings: BindingApi[] = [];

  constructor(
    appState: AppState,
    bus: AudioBus,
    projection: DomeProjection,
    dome: DomeScene,
    actions: TweakpaneUIActions,
  ) {
    this.pane = new Pane({ title: 'Dome Previs', expanded: true });

    const cfg = this.pane.addFolder({ title: 'Config' });
    cfg.addBinding(appState, 'cubemapResolution', {
      options: { '256': 256, '512': 512, '1024': 1024, '2048': 2048 },
    }).on('change', (ev) => projection.setResolution(ev.value as number));
    cfg.addBinding(appState, 'domeOpacity', { min: 0.0, max: 1.0, step: 0.01 })
      .on('change', (ev) => projection.setOpacity(ev.value as number));
    cfg.addBinding(appState, 'showFrustums').on('change', (ev) => dome.setFrustumsVisible(ev.value as boolean));
    cfg.addBinding(appState, 'showFisheyeInset');

    this.templateFolder = this.pane.addFolder({ title: 'Template' });
    this.templateFolder.addBinding(appState, 'templateId', {
      options: {
        Planetarium: 'planetarium',
        Terrain: 'terrain',
        'Music Viz': 'musicviz',
        '360 Video': 'video360',
      },
    }).on('change', (ev) => actions.onTemplateChange(ev.value as TemplateId));

    const spk = this.pane.addFolder({ title: 'Speakers' });
    bus.speakers.forEach((s, i) => {
      const row = spk.addFolder({ title: `Speaker ${i + 1}`, expanded: false });
      const rowState = { gain: 1, mute: false, azimuth: (i * 360) / bus.speakers.length };
      row.addBinding(rowState, 'gain', { min: 0, max: 2, step: 0.01 })
        .on('change', (ev) => s.setGain(ev.value as number));
      row.addBinding(rowState, 'mute')
        .on('change', (ev) => s.setMuted(ev.value as boolean));
      row.addBinding(rowState, 'azimuth', { min: 0, max: 360, step: 1 })
        .on('change', (ev) => {
          const az = ((ev.value as number) * Math.PI) / 180;
          const x = Math.cos(az) * 10;
          const z = Math.sin(az) * 10;
          s.panner.positionX.value = x;
          s.panner.positionZ.value = z;
          s.box.position.set(x, s.box.position.y, z);
          s.frustum.position.set(x, s.frustum.position.y, z);
          s.frustum.rotation.set(0, 0, 0);
          s.frustum.lookAt(0, 3, 0);
          s.frustum.rotateX(-Math.PI / 2);
        });
    });

    const cam = this.pane.addFolder({ title: 'Camera' });
    cam.addBinding(appState, 'cameraMode', {
      options: { Orbit: 'orbit', 'First-person': 'first-person', 'XR View': 'xr-view' },
    }).on('change', (ev) => actions.onCameraModeChange(ev.value as CameraMode));
    cam.addBinding(appState, 'fov', { min: 40, max: 110, step: 1 });
    cam.addButton({ title: 'Save Preset 1' }).on('click', () => actions.onPresetSave(1));
    cam.addButton({ title: 'Recall Preset 1' }).on('click', () => actions.onPresetRecall(1));
    cam.addButton({ title: 'Save Preset 2' }).on('click', () => actions.onPresetSave(2));
    cam.addButton({ title: 'Recall Preset 2' }).on('click', () => actions.onPresetRecall(2));
  }

  bindTemplateParams(template: Template) {
    this.currentTemplateBindings.forEach((b) => b.dispose());
    this.currentTemplateBindings = [];
    const params = template.getParams() as Record<string, unknown>;
    for (const key of Object.keys(params)) {
      const v = params[key];
      if (typeof v === 'number') {
        const opts = { min: 0, max: Math.max(10, v * 4), step: v < 1 ? 0.01 : 1 };
        const b = this.templateFolder.addBinding(params, key, opts);
        this.currentTemplateBindings.push(b);
      } else if (typeof v === 'boolean') {
        const b = this.templateFolder.addBinding(params, key);
        this.currentTemplateBindings.push(b);
      } else if (typeof v === 'string') {
        const b = this.templateFolder.addBinding(params, key, { readonly: true });
        this.currentTemplateBindings.push(b);
      }
    }
  }
}
