import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

// TSL typings are strict about float vs vec3 lineage but runtime is
// permissive — we use untyped helpers inside the shader body and let the
// node graph handle coercion. Materials that stay in TSL-native types
// (no `.assign` across widths) won't need this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = TSL;
const {
  Fn, uniform, vec3, float, normalize, mix, smoothstep, max, dot, pow,
  sin, floor, fract, length, positionLocal, time,
} = T;

export class SkyMaterial extends NodeMaterial {
  uHorizonNear = uniform(new THREE.Color(0x2a3a55));
  uHorizonFar  = uniform(new THREE.Color(0x1a2a45));
  uMidSky      = uniform(new THREE.Color(0x0a122c));
  uZenith      = uniform(new THREE.Color(0x020514));
  uNightAmount = uniform(1.0);
  uSunDir      = uniform(new THREE.Vector3(0.3, -0.15, 0.7).normalize());
  uSunGlow     = uniform(new THREE.Color(0xffd489));
  uMoonDir     = uniform(new THREE.Vector3(0.3, 0.5, -0.4).normalize());
  uStarWarmth       = uniform(0.3);
  uStarDensity      = uniform(1.0);
  uStarSize         = uniform(0.85);
  uStarBrightness   = uniform(1.0);
  uStarTwinkleSpeed = uniform(1.0);
  uAuroraSpeed      = uniform(0.8);
  uAuroraScale      = uniform(0.55);
  uAuroraIntensity  = uniform(1.4);
  uAuroraSmoothness = uniform(0.35);
  uAuroraHeight     = uniform(0.42);

  constructor() {
    super();
    this.side = THREE.BackSide;
    this.depthWrite = false;
    this.fog = false;

    const {
      uHorizonNear, uHorizonFar, uMidSky, uZenith, uNightAmount,
      uSunDir, uSunGlow,
      uStarWarmth, uStarDensity, uStarSize, uStarBrightness, uStarTwinkleSpeed,
      uAuroraSpeed, uAuroraScale, uAuroraIntensity, uAuroraSmoothness, uAuroraHeight,
    } = this;

    this.colorNode = Fn(() => {
      const dir = normalize(positionLocal).toVar();
      const y   = dir.y.toVar();

      const sky = mix(uHorizonNear, uHorizonFar, smoothstep(float(0.0), float(0.07), y)).toVar('sky');
      sky.assign(mix(sky, uMidSky, smoothstep(float(0.07), float(0.32), y)));
      sky.assign(mix(sky, uZenith, smoothstep(float(0.32), float(0.80), y)));

      const groundDay   = uHorizonNear.mul(0.35);
      const groundNight = vec3(0.01, 0.008, 0.005);
      const ground      = mix(groundDay, groundNight, uNightAmount);
      const belowColor  = mix(
        uHorizonNear.mul(0.4),
        ground,
        smoothstep(float(-0.25), float(0.0), y).oneMinus(),
      );
      const belowMask = smoothstep(float(-0.005), float(0.005), y).oneMinus();
      sky.assign(mix(sky, belowColor, belowMask));

      const sunDot = max(float(0.0), dot(dir, uSunDir)).toVar('sunDot');
      const sunVis = float(1.0).sub(uNightAmount);
      sky.addAssign(uSunGlow.mul(smoothstep(float(0.997), float(0.999), sunDot).mul(2.0)).mul(sunVis));
      sky.addAssign(uSunGlow.mul(pow(sunDot, float(40.0)).mul(0.7)).mul(sunVis));
      sky.addAssign(uSunGlow.mul(0.35).mul(pow(sunDot, float(4.0)).mul(0.30)).mul(sunVis));

      const starCol1 = mix(vec3(0.95, 0.95, 1.0), vec3(1.0, 0.85, 0.55), uStarWarmth);
      const starCol2 = mix(vec3(0.85, 0.88, 1.0), vec3(1.0, 0.75, 0.45), uStarWarmth);

      const thresh1 = float(1.005).sub(uStarDensity.mul(0.20));
      const thresh2 = float(1.005).sub(uStarDensity.mul(0.16));

      const circleOuter = float(0.48).sub(uStarSize.mul(0.15));
      const circleInner = float(0.48).sub(uStarSize.mul(0.45));

      const starP1   = dir.mul(300.0);
      const cell1    = floor(starP1);
      const frac1    = fract(starP1);
      const hd1      = cell1.x.add(cell1.y.mul(157.0)).add(cell1.z.mul(113.0));
      const h1Raw    = sin(hd1.mul(12.9898)).mul(43758.5453);
      const hash1    = h1Raw.sub(floor(h1Raw));
      const h2Raw    = sin(hd1.mul(78.233)).mul(23421.631);
      const bright1  = h2Raw.sub(floor(h2Raw));
      const star1On  = smoothstep(thresh1, thresh1.add(0.005), hash1);
      const dist1    = length(frac1.sub(0.5));
      const circle1  = smoothstep(circleOuter, circleInner, dist1);
      const star1    = star1On.mul(bright1.mul(0.7).add(0.3)).mul(circle1);
      const twinkle1 = sin(hash1.mul(200.0).add(time.mul(uStarTwinkleSpeed.mul(0.5)))).mul(0.25).add(0.75);
      const starMask = smoothstep(float(0.02), float(0.15), y);
      sky.addAssign(starCol1.mul(star1.mul(twinkle1).mul(uNightAmount).mul(starMask).mul(uStarBrightness)));

      const starP2   = dir.mul(600.0);
      const cell2    = floor(starP2);
      const frac2    = fract(starP2);
      const hd2      = cell2.x.add(cell2.y.mul(211.0)).add(cell2.z.mul(97.0));
      const h3Raw    = sin(hd2.mul(45.678)).mul(17853.321);
      const hash2    = h3Raw.sub(floor(h3Raw));
      const h4Raw    = sin(hd2.mul(98.765)).mul(31247.159);
      const bright2  = h4Raw.sub(floor(h4Raw));
      const star2On  = smoothstep(thresh2, thresh2.add(0.005), hash2);
      const dist2    = length(frac2.sub(0.5));
      const circle2  = smoothstep(circleOuter, circleInner, dist2);
      const star2    = star2On.mul(bright2.mul(0.5).add(0.2)).mul(circle2);
      const twinkle2 = sin(hash2.mul(150.0).add(time.mul(uStarTwinkleSpeed.mul(0.3)))).mul(0.2).add(0.8);
      sky.addAssign(starCol2.mul(star2.mul(twinkle2).mul(uNightAmount).mul(starMask).mul(uStarBrightness).mul(0.6)));

      const aT = time.mul(uAuroraSpeed);

      const apx = dir.mul(uAuroraScale).x.mul(5.0);
      const apz = dir.mul(uAuroraScale).z.mul(5.0);

      const warpX = sin(apx.mul(0.7).add(apz.mul(0.5)).add(aT.mul(0.11))).mul(1.5);
      const warpZ = sin(apz.mul(0.8).sub(apx.mul(0.6)).sub(aT.mul(0.09))).mul(1.2);
      const awx = apx.add(warpX);
      const awz = apz.add(warpZ);

      const c1 = sin(awx.mul(1.0).add(awz.mul(0.7)).add(aT.mul(0.17)));
      const c2 = sin(awx.mul(2.3).sub(awz.mul(1.5)).sub(aT.mul(0.13)));
      const c3 = sin(awx.mul(4.7).add(awz.mul(3.1)).add(aT.mul(0.21)));

      const smInv = float(1.0).sub(uAuroraSmoothness);
      const curtain = c1.mul(0.45)
        .add(c2.mul(0.30).mul(smInv.mul(0.6).add(0.4)))
        .add(c3.mul(0.15).mul(smInv));

      const auroraBright = pow(max(curtain.mul(0.5).add(0.55), float(0.0)), float(2.2));

      const auroraRise = smoothstep(float(0.03), uAuroraHeight.sub(0.05), y);
      const auroraFall = smoothstep(uAuroraHeight.add(0.05), uAuroraHeight.add(0.30), y).oneMinus();
      const auroraVert = auroraRise.mul(auroraFall);

      const auroraHFrac = smoothstep(float(0.03), uAuroraHeight.add(0.25), y);

      const auroraRays = sin(awx.mul(12.0).add(awz.mul(9.0)).add(aT.mul(1.5)))
        .mul(0.08).add(0.92);

      const auroraPulse = sin(aT.mul(0.5).add(apx.mul(0.3))).mul(0.07).add(0.93);

      const aColGreen  = vec3(0.1, 1.0, 0.4);
      const aColTeal   = vec3(0.05, 0.8, 0.7);
      const aColPurple = vec3(0.55, 0.12, 0.85);
      const aColLow    = mix(aColGreen, aColTeal, smoothstep(float(0.0), float(0.4), auroraHFrac));
      const aColFinal  = mix(aColLow, aColPurple, smoothstep(float(0.4), float(1.0), auroraHFrac));

      sky.addAssign(
        aColFinal
          .mul(auroraBright)
          .mul(auroraVert)
          .mul(auroraRays)
          .mul(auroraPulse)
          .mul(uAuroraIntensity)
          .mul(uNightAmount),
      );

      return sky;
    })();
  }
}
