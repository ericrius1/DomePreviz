# Dome Show Previs — Design

Status: Approved 2026-04-21
Scope: Single-app MVP for previsualizing dome-show content in the browser, with desktop + WebXR viewing, 5-channel spatial audio, and three sample content templates plus 360 video playback.

## Overview

A Three.js + Vite + TypeScript web app for previsualizing dome-show content. The dome is modeled as the projection surface — template content renders to a cubemap from the dome's center, then displays on the dome's inside surface. This matches real fulldome projection workflow so what authors see in previs corresponds to what they'll see in the physical dome.

Three sample templates ship in v1: planetarium with stars and comets, terrain at sunset, and an abstract music visualizer. A fourth mode plays user-supplied equirectangular 360 video on the dome. Users switch templates via a Tweakpane panel and can view the dome in orbit mode (external inspection), first-person pointer-lock mode (inside the dome), or WebXR (VR headset at dome center, with controller ray for UI interaction).

Five procedurally-driven spatial audio channels play from speaker positions placed around the base ring where the dome meets the floor, visualized in-world as small boxes with colored frustum cones pointing inward.

## Non-goals

- Real projector calibration (blend masks, warp, throw-distance sims). This is a content previs tool, not a projector-alignment tool.
- Loading user-authored 3D scenes or timeline sequencing. Templates are fixed in v1.
- Mobile/touch support. Desktop and WebXR only.
- Automated tests. Validation is visual/interactive in a browser.
- Persisted user settings across reloads.

## Dome geometry

- Full hemisphere, **10 m radius**, centered at world origin.
- Floor: opaque matte disc at `y = 0`.
- Listener / first-person camera default height: `1.6 m`.
- Dome mesh: `SphereGeometry(10, 96, 64, 0, 2π, 0, π/2)` (upper hemisphere). Double-sided material; interior samples the cubemap, exterior shows a slightly darkened/tinted pass so orbit mode reads as "a big projected screen."

## Architecture

```
src/
  main.ts                      # bootstrap, renderer, render loop, XR button
  app/
    DomeScene.ts               # outer scene: dome, floor, speakers, HUD; owns THREE.Scene
    DomeProjection.ts          # CubeCamera + cubemap render target + dome shader material
    CameraController.ts        # orbit / first-person / XR mode switching
  templates/
    Template.ts                # interface
    PlanetariumTemplate.ts
    TerrainSunsetTemplate.ts
    MusicVizTemplate.ts
    Video360Template.ts
    registry.ts                # id → factory map
  audio/
    AudioBus.ts                # shared Web Audio context + master gain
    Speaker.ts                 # PannerNode + visual proxy mesh + frustum cone
    templates/
      PlanetariumAudio.ts
      TerrainAudio.ts
      MusicVizAudio.ts
      Video360Audio.ts         # routes video element's audio track to bus
  ui/
    TweakpaneUI.ts             # folder builder, rebinds on template change
    FisheyeInset.ts            # small corner canvas showing fisheye remap
  xr/
    XRControllers.ts           # controller ray + trigger → UI action dispatch
  types.ts                     # AppState, Template interface, events
```

### Render loop per frame

1. Update active template (animations, audio analysis read, uniform writes).
2. Toggle dome mesh invisible; render template scene → `CubeCamera` at dome center → cube render target.
3. Toggle dome mesh visible; render outer scene with active camera (orbit / first-person / XR). Dome samples the cube render target.
4. Render fisheye inset to a small offscreen square target, blit to a DOM-corner canvas.

### Dome projection

- `THREE.CubeCamera` at `(0, 1.6, 0)` with `WebGLCubeRenderTarget` at 1024 px per face (falls back to 512 in XR for performance).
- Template `THREE.Scene` is rendered into the cubemap. Templates do not know about the dome — they populate a scene that the dome projection consumes.
- Dome `ShaderMaterial`: samples the cubemap on interior faces using the fragment's view direction (`-normalize(position - cubeCenter)` mapped to a samplerCube lookup). Exterior faces multiply the sample by a configurable opacity so orbit mode reads the projection through the dome shell.

## Templates

### Template interface

```ts
interface Template {
  id: 'planetarium' | 'terrain' | 'musicviz' | 'video360';
  init(scene: THREE.Scene, bus: AudioBus): void;
  update(dt: number, time: number): void;
  dispose(): void;
  getParams(): TweakpaneSchema;
}
```

Switching templates: `dispose()` current → instantiate next → `init()` with a fresh child scene group → rebuild the Template tab in Tweakpane from `getParams()`.

### PlanetariumTemplate
- ~2000 instanced point-stars on a far sphere (radius 500), shader-driven twinkle via per-instance phase uniform.
- 3 comets: each a `THREE.Line` trail (capped `BufferGeometry` ring) with a sprite head, linear trajectories crossing the upper hemisphere, respawn on exit.
- Params: `starDensity`, `cometRate`, `twinkleSpeed`, `palette`.

### TerrainSunsetTemplate
- 256 × 256 plane centered at origin. fBm heightmap computed in the vertex shader with scrollable noise.
- Gradient sky sphere (radius 400): orange → purple → deep blue, driven by `sunAngle`.
- Low-angle directional sun with a cheap bloom pass on the main template render target.
- Params: `sunAngle`, `terrainAmplitude`, `fogDensity`, `windSpeed`.

### MusicVizTemplate
- Reads FFT from an `AnalyserNode` on the audio bus.
- Instanced ring of bars (default 64) around dome center; a central `IcosahedronGeometry` with vertex displacement from bass/mid/treble bands.
- Params: `barCount`, `reactivity`, `palette`, `rotationRate`.

### Video360Template
- `<video>` element + `THREE.VideoTexture` applied to an inward-facing sphere (radius 50). Equirectangular mapping.
- UI hooks for file picker / drag-drop onto the canvas; `play/pause`, `seek` in params.
- Params: `play`, `seek`, `loop`, `file` (readonly label of loaded source).
- If the loaded video has an audio track, route it through the AudioBus instead of procedural audio (template-owned source).

## Audio

- One shared `AudioContext`, lazily resumed on first user gesture.
- Master chain: template source → master `GainNode` → destination.
- **5 speakers** on the base ring, equally spaced (72° apart), at `y = 0`, 10 m from origin. Each is a `PannerNode` (HRTF) with position on the ring and cone orientation pointing inward. Per-speaker `GainNode` upstream for mute/gain.
- Listener = current camera. In orbit/first-person, updated from the camera's world matrix each frame. In XR, use the XR head pose.
- **Per-template sources**:
  - Planetarium: five low ambient drones, slight detune per speaker, slow LFO on filter cutoff.
  - Terrain: filtered pink noise "wind," each speaker gets a different comb filter and slow LFO amplitude.
  - Music viz: 4-voice synth (lead, pad, bass, kick) routed to speakers — bass goes to all speakers equally, kick favors front-center speaker, leads rotate around the ring.
  - Video 360: video element's `MediaElementAudioSourceNode` → 5 equal sends, acting like a mono-fallback until a multichannel video path is added.
- Visual proxies: each speaker is a `BoxGeometry` small unit (e.g., 0.3 × 0.5 × 0.3) at its ring position, with a translucent colored `ConeGeometry` frustum extending inward, scale modulated by the live gain of that speaker.

## Cameras and modes

- **Orbit** (default): `OrbitControls` around `(0, 2, 0)`. Damping on. Max polar angle clamped so users don't clip through the floor.
- **First-person**: `PointerLockControls` anchored at `(0, 1.6, 0)`. Look only; no WASD. ESC releases pointer lock.
- **XR**: `renderer.xr.enabled = true`, `VRButton` from `three/examples/jsm/webxr/VRButton`. On session start, XR rig positioned so the headset origin is `(0, 0, 0)` at standing height.

Switching modes disposes the previous controls cleanly (`OrbitControls.dispose()` / remove pointer-lock event listeners / end XR session) and sets up the next.

## WebXR controllers

- Two XR controllers tracked via `renderer.xr.getController(0|1)`.
- Each controller renders a laser ray using `XRControllerModelFactory` + a line mesh along local -Z.
- Trigger press (`selectstart`) raycasts against a set of "XR UI" billboards floating in front of the user at `z = -1.5 m`: template-switch buttons and camera-mode buttons. Hit → dispatch same action the Tweakpane control would fire.
- Desktop Tweakpane remains the source of truth; XR UI is a parallel surface that calls the same action handlers.

## Tweakpane UI

Right-docked panel. Folders:

- **Config** — `cubemapResolution` (256 / 512 / 1024 / 2048), `domeOpacity`, `showFrustums` (bool), `showFisheyeInset` (bool), `dome.radius` (readonly).
- **Template** — `active` dropdown (`planetarium` | `terrain` | `musicviz` | `video360`); below that, dynamically rebuilt params from `getParams()` for the active template.
- **Speakers** — 5 rows: per-speaker `gain`, `mute`, `azimuth` (°).
- **Camera** — `mode` (`orbit` | `first-person` | `xr-view`), `fov`, `preset 1` / `preset 2` pulse buttons (orbit camera snapshots, saved to memory, restored on pulse).

### Fisheye inset

- 256 × 256 canvas pinned to the bottom-left corner of the viewport.
- Each frame, a small fragment shader samples the cubemap using a dome-master fisheye remap (azimuthal equidistant projection restricted to upper hemisphere), writes into a square render target, blits to the DOM canvas.
- Toggleable via `Config.showFisheyeInset`.

## Aesthetic notes

Inspired by reference TouchDesigner fulldome previs UI (provided by user):

- Semi-transparent dome shell in orbit mode so the projected content is readable through the back.
- Colored frustum cones from each speaker inward for a "projector rig" feel.
- Small square fisheye preview in the corner showing the raw dome-master texture.
- Dark viewport background with subtle grid floor.

## Error handling

- No `AudioContext` permission: catch, surface a "click to enable audio" Tweakpane button that calls `context.resume()`.
- WebXR not supported: hide the VR button, leave a disabled tooltip.
- Video 360 load failure: show a small toast over the Tweakpane panel, fall back to a placeholder solid-color sphere.
- Cubemap render target creation failure (e.g., context loss): attempt one recreation; if it fails again, log and continue rendering the outer scene only.

Validation is done interactively in a browser — open dev server, cycle through templates, switch modes, load a 360 video, confirm VR works on a connected headset.

## Tooling

- `npm create vite@latest` vanilla-ts template.
- Deps: `three`, `@types/three`, `tweakpane`.
- Scripts: `dev`, `build`, `preview`, `check` (runs `tsc --noEmit && vite build`).
- No linting/formatting tooling beyond TypeScript's built-in checks in v1.

## Out of scope for v1 (future)

- Stereoscopic 360 video (top-bottom / side-by-side).
- Fisheye dome-master video format alongside equirectangular.
- XR controller locomotion / teleport.
- Projector rig placement and blend visualization.
- Saving/loading user presets to disk.
