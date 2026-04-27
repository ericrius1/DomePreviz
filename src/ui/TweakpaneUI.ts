import { Pane } from 'tweakpane';
import type { FolderApi } from '@tweakpane/core';
import type { AppState, CameraMode, ProjectionMode, TemplateAction, TweakpaneSchema } from '../types';

interface Disposable { dispose(): void; }

export interface TemplateLike {
  getParams(): TweakpaneSchema;
  getActions?(): TemplateAction[];
}

export interface TweakpaneUIActions {
  onCameraModeChange: (mode: CameraMode) => void;
  onPresetSave: (slot: 1 | 2) => void;
  onPresetRecall: (slot: 1 | 2) => void;
  onProjectionModeChange: (m: ProjectionMode) => void;
  onPerformancePreviewChange: (on: boolean) => void;
  onFirstPersonHeightChange: (h: number) => void;
  onDomeRadiusChange: (r: number) => void;
}

export class TweakpaneUI {
  pane: Pane;
  templateFolder: FolderApi;
  private currentTemplateItems: Disposable[] = [];

  constructor(appState: AppState, actions: TweakpaneUIActions) {
    this.pane = new Pane({ title: 'Dome Previs', expanded: true });

    const cfg = this.pane.addFolder({ title: 'Config' });
    cfg.addBinding(appState, 'projectionMode', {
      options: { Hemisphere: 'hemisphere', 'Fulldome (squash)': 'fulldome' },
    }).on('change', (ev) => actions.onProjectionModeChange(ev.value as ProjectionMode));
    cfg.addBinding(appState, 'domeRadius', { label: 'Dome Size (m)', min: 2, max: 50, step: 0.1 })
      .on('change', (ev) => actions.onDomeRadiusChange(ev.value));
    cfg.addBinding(appState, 'showFisheyeInset');
    cfg.addBinding(appState, 'performancePreview', { label: 'Performance Preview' })
      .on('change', (ev) => actions.onPerformancePreviewChange(ev.value));

    this.templateFolder = this.pane.addFolder({ title: '360 Media' });

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

  bindTemplateParams(template: TemplateLike) {
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
    const templateActions = template.getActions?.() ?? [];
    for (const action of templateActions) {
      const btn = this.templateFolder.addButton({ title: action.label }).on('click', () => action.run());
      this.currentTemplateItems.push(btn);
    }
  }
}
