import { Pane } from 'tweakpane';
import type { FolderApi } from '@tweakpane/core';
import type { AppState, Template, TemplateId, CameraMode, CubeResolution, ProjectionMode } from '../types';

interface Disposable { dispose(): void; }

export interface TweakpaneUIActions {
  onTemplateChange: (id: TemplateId) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onPresetSave: (slot: 1 | 2) => void;
  onPresetRecall: (slot: 1 | 2) => void;
  onProjectionModeChange: (m: ProjectionMode) => void;
  onCubeResolutionChange: (v: CubeResolution) => void;
  onFirstPersonHeightChange: (h: number) => void;
}

export class TweakpaneUI {
  pane: Pane;
  private templateFolder: FolderApi;
  private currentTemplateItems: Disposable[] = [];

  constructor(appState: AppState, actions: TweakpaneUIActions) {
    this.pane = new Pane({ title: 'Dome Previs', expanded: true });

    const cfg = this.pane.addFolder({ title: 'Config' });
    cfg.addBinding(appState, 'domeCubeResolution', {
      options: { '256': 256, '512': 512, '1024': 1024, '2048': 2048 },
    }).on('change', (ev) => actions.onCubeResolutionChange(ev.value as CubeResolution));
    cfg.addBinding(appState, 'projectionMode', {
      options: { Hemisphere: 'hemisphere', 'Fulldome (squash)': 'fulldome' },
    }).on('change', (ev) => actions.onProjectionModeChange(ev.value as ProjectionMode));
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
    cam.addBinding(appState, 'firstPersonHeight', { label: 'FP Height (m)', min: 1, max: 4, step: 0.01 })
      .on('change', (ev) => actions.onFirstPersonHeightChange(ev.value));
    cam.addButton({ title: 'Save Preset 1' }).on('click', () => actions.onPresetSave(1));
    cam.addButton({ title: 'Recall Preset 1' }).on('click', () => actions.onPresetRecall(1));
    cam.addButton({ title: 'Save Preset 2' }).on('click', () => actions.onPresetSave(2));
    cam.addButton({ title: 'Recall Preset 2' }).on('click', () => actions.onPresetRecall(2));
  }

  bindTemplateParams(template: Template) {
    this.currentTemplateItems.forEach((b) => b.dispose());
    this.currentTemplateItems = [];
    const params = template.getParams() as Record<string, unknown>;
    for (const key of Object.keys(params)) {
      const v = params[key];
      if (typeof v === 'number') {
        const opts = { min: 0, max: Math.max(10, v * 4), step: v < 1 ? 0.01 : 1 };
        const b = this.templateFolder.addBinding(params, key, opts);
        this.currentTemplateItems.push(b);
      } else if (typeof v === 'boolean') {
        const b = this.templateFolder.addBinding(params, key);
        this.currentTemplateItems.push(b);
      } else if (typeof v === 'string') {
        const b = this.templateFolder.addBinding(params, key, { readonly: true });
        this.currentTemplateItems.push(b);
      }
    }
    const actions = template.getActions?.() ?? [];
    for (const action of actions) {
      const btn = this.templateFolder.addButton({ title: action.label }).on('click', () => action.run());
      this.currentTemplateItems.push(btn);
    }
  }
}
