/**
 * GradientState — mirrors the original Stripe MiniGL tool parameters exactly.
 *
 * The 3D pipeline:
 *   1.  A large subdivided XZ plane (mesh detail × mesh detail quads)
 *   2.  Vertex shader: scale → noise displacement on Y → twist → model rotation/position
 *   3.  Perspective camera looking at origin from a configurable angle
 *   4.  Fragment shader: noise-driven color band blending → HSL adjust
 *   5.  Bloom post-process: bright extract → H-blur → V-blur → composite + grain
 */

// Up to 6 colors in the gradient palette
export type HexColor = string;

export interface GradientState {
  // ── Canvas ───────────────────────────────────────────────────────
  canvasWidth:  number;   // px
  canvasHeight: number;   // px

  // ── Color palette ─────────────────────────────────────────────────
  colors: HexColor[];     // 2–6 colors, blended by noise

  // ── Mesh transform (model matrix) ─────────────────────────────────
  positionX: number;      // world-unit offset (camera space)
  positionY: number;
  positionZ: number;
  scaleX: number;         // displacement noise scale on each axis
  scaleY: number;         // also controls apparent "density" of waves
  scaleZ: number;
  rotationX: number;      // radians — tilt the mesh (main 3D look)
  rotationY: number;
  rotationZ: number;

  // ── Vertex displacement ───────────────────────────────────────────
  displaceFreqX: number;  // noise frequency in X (0.001–0.05)
  displaceFreqZ: number;  // noise frequency in Z (0.001–0.05)
  displaceAmount: number; // displacement height multiplier (–30 to 30)

  // ── Twist (applied after displacement, creates ribbon/weave look) ──
  twistFreqX: number;     // –2 to 2
  twistFreqY: number;
  twistFreqZ: number;
  twistPowX:  number;     // 0 to 6 — how strongly twist wraps
  twistPowY:  number;
  twistPowZ:  number;

  // ── Color mapping ─────────────────────────────────────────────────
  colorContrast:    number;  // 0.5–3
  colorSaturation:  number;  // 0–2.5
  colorHueShift:    number;  // –0.5 to 0.5

  // ── Glow / bloom ──────────────────────────────────────────────────
  glowAmount: number;   // 0–5  — bloom strength
  glowPower:  number;   // 0–1  — brightness threshold
  glowRamp:   number;   // 0–1  — bloom softness

  // ── Post-processing ───────────────────────────────────────────────
  blur:       number;   // 0–2   — radial/motion blur passes
  grain:      number;   // 0–2   — film grain
  vignette:   number;   // 0–1.5 — edge darkening

  // ── Camera ────────────────────────────────────────────────────────
  cameraFov:  number;   // degrees (20–90)
  cameraDist: number;   // distance from origin (200–1200)

  // ── Animation ─────────────────────────────────────────────────────
  speed:    number;    // global time multiplier
  paused:   boolean;

  // ── Quality / Performance ─────────────────────────────────────────
  meshDetail: number;  // subdivisions (32–160)
  wireframe:  boolean;
  targetFps:  number;  // render cap (10–60), default 30
  dpr:        number;  // device pixel ratio cap (1 or 2)
  bgColor:    string;  // hex — mesh edges blend into this color
}

// ── Helpers ─────────────────────────────────────────────────────────

export function cloneState(s: GradientState): GradientState {
  return { ...s, colors: [...s.colors] };
}

export function serializeState(s: GradientState): string {
  return btoa(JSON.stringify(s));
}

export function deserializeState(raw: string): GradientState | null {
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<GradientState>;
    // Merge with DEFAULT_STATE so new fields introduced in later versions are populated
    return { ...DEFAULT_STATE, ...parsed, colors: parsed.colors ?? DEFAULT_STATE.colors };
  } catch { return null; }
}

// ── Default — "Stripe Classic" with the exact original tool values ──
export const DEFAULT_STATE: GradientState = {
  canvasWidth:  1200,
  canvasHeight: 675,

  colors: ['#0048e5', '#ff6030', '#e040fb', '#00c8e8', '#ffffff'],

  positionX:  0,
  positionY:  0,
  positionZ:  0,
  scaleX:     7.2,
  scaleY:     8.0,
  scaleZ:     6.0,
  rotationX: -0.45,
  rotationY: -0.12,
  rotationZ:  1.87,

  displaceFreqX:  0.0058,
  displaceFreqZ:  0.016,
  displaceAmount: -7.8,

  twistFreqX: -0.65,
  twistFreqY:  0.41,
  twistFreqZ: -0.58,
  twistPowX:   3.63,
  twistPowY:   0.70,
  twistPowZ:   3.95,

  colorContrast:   1.0,
  colorSaturation: 1.0,
  colorHueShift:  -0.24,

  glowAmount: 1.98,
  glowPower:  0.806,
  glowRamp:   0.834,

  blur:     0.02,
  grain:    1.1,
  vignette: 0.0,

  cameraFov:  45,
  cameraDist: 600,

  speed:    1.0,
  paused:   false,

  meshDetail: 80,
  wireframe:  false,
  targetFps:  30,
  dpr:        1,
  bgColor:    '#0a0a14',
};
