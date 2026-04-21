import { Pane } from 'tweakpane';
import type { FolderApi, BindingApi } from '@tweakpane/core';
import type { AppState, Template, TemplateId, CameraMode, CubeResolution } from '../types';

export interface TweakpaneUIActions {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onPresetSave: (slot: 1 | 2) => void;
  onPresetRecall: (slot: 1 | 2) => void;
  onDomeOpacityChange: (v: number) => void;
  onCubeResolutionChange: (v: CubeResolution) => void;
}

export class TweakpaneUI {
  pane: Pane;
  private templateFolder: FolderApi;
  private currentTemplateBindings: BindingApi[] = [];

  constructor(appState: AppState, actions: TweakpaneUIActions) {
    this.pane = new Pane({ title: 'Dome Previs', expanded: true });

    const cfg = this.pane.addFolder({ title: 'Config' });
    cfg.addBinding(appState, 'domeCubeResolution', {
      options: { '256': 256, '512': 512, '1024': 1024, '2048': 2048 },
    }).on('change', (ev) => actions.onCubeResolutionChange(ev.value as CubeResolution));
    cfg.addBinding(appState, 'domeOpacity', { min: 0.0, max: 1.0, step: 0.01 })
      .on('change', (ev) => actions.onDomeOpacityChange(ev.value as number));
    cfg.addBinding(appState, 'showFisheyeInset');

    this.templateFolder = this.pane.addFolder({ title: 'Template' });
    this.templateFolder.addBinding(appState, 'templateId', {
      options: {
        Planetarium: 'planetarium',
        Terrain: 'terrain',
        Aurora: 'aurora',
        '360 Video': 'video360',
      },
    }).on('change', (ev) => actions.onTemplateChange(ev.value as TemplateId));

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
