# Dome Previs

Three.js + Vite + TypeScript previsualization tool for dome-show content.

## Run

```bash
npm install
npm run dev
```

## Features

- 4 content modes: Planetarium (stars + comets), Terrain Sunset, Music Visualizer, 360 Video (drag-drop any `.mp4` onto the window)
- Camera modes: orbit (external), first-person (pointer lock — click to lock, ESC to release), WebXR (VR button, headset at dome center, trigger + ray to switch templates)
- 5-channel spatial audio via Web Audio `PannerNode` speakers at the dome base ring
- Tweakpane UI for all settings; fisheye dome-master preview in the bottom-left corner

## Validate changes

```bash
npm run check
```

TypeScript is the test suite. Interactive validation is visual — `npm run dev` and click through each template / camera mode.
