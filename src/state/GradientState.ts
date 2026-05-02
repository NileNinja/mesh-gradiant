export interface ColorStop {
  hex:   string;   // '#rrggbb'
  alpha: number;   // 0..1
}

export type RenderMode = 'waves' | 'blobs' | 'hybrid';
export type Material   = 'standard' | 'iridescent' | 'glass' | 'plasma' | 'silk';
export type MotionMode = 'flow' | 'drift' | 'swirl' | 'ripple' | 'pulse' | 'breathe' | 'aurora' | 'custom';

export interface GradientState {
  // ── Canvas ───────────────────────────────────────────────────────
  canvasWidth:  number;
  canvasHeight: number;

  // ── Color palette ─────────────────────────────────────────────────
  colors: ColorStop[];   // 2–8 stops; each has hex + alpha

  // ── Render style ─────────────────────────────────────────────────
  renderMode: RenderMode;
  material:   Material;

  // ── Material params ───────────────────────────────────────────────
  iridescence:         number;  // 0–1
  chromaticAberration: number;  // 0–2
  refraction:          number;  // 0–1

  // ── Motion ────────────────────────────────────────────────────────
  motionMode:      MotionMode;
  motionIntensity: number;   // 0–1, scales overall movement amplitude

  // ── Mesh transform (model matrix) ─────────────────────────────────
  positionX: number;
  positionY: number;
  positionZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;

  // ── Vertex displacement ───────────────────────────────────────────
  displaceFreqX: number;
  displaceFreqZ: number;
  displaceAmount: number;

  // ── Twist ─────────────────────────────────────────────────────────
  twistFreqX: number;
  twistFreqY: number;
  twistFreqZ: number;
  twistPowX:  number;
  twistPowY:  number;
  twistPowZ:  number;

  // ── Color mapping ─────────────────────────────────────────────────
  colorContrast:   number;
  colorSaturation: number;
  colorHueShift:   number;

  // ── Glow / bloom ──────────────────────────────────────────────────
  glowAmount: number;
  glowPower:  number;
  glowRamp:   number;

  // ── Post-processing ───────────────────────────────────────────────
  blur:     number;
  grain:    number;
  vignette: number;

  // ── Camera ────────────────────────────────────────────────────────
  cameraFov:  number;
  cameraDist: number;

  // ── Animation ─────────────────────────────────────────────────────
  speed:    number;
  paused:   boolean;

  // ── Randomization seed (stable reproducibility) ────────────────────
  seed: number;

  // ── Quality / Performance ─────────────────────────────────────────
  meshDetail:    number;
  wireframe:     boolean;
  targetFps:     number;
  dpr:           number;
  bgColor:       string;
  reducedMotion: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

export function cloneState(s: GradientState): GradientState {
  return { ...s, colors: s.colors.map(c => ({ ...c })) };
}

export function serializeState(s: GradientState): string {
  return btoa(JSON.stringify(s));
}

/** Migrate old hex-string colors array to ColorStop[]. */
function migrateColors(raw: unknown): ColorStop[] {
  if (!Array.isArray(raw)) return DEFAULT_STATE.colors.map(c => ({ ...c }));
  return raw.map(c => {
    if (typeof c === 'string') return { hex: c, alpha: 1 };
    if (c && typeof c === 'object' && 'hex' in c)
      return { hex: (c as ColorStop).hex, alpha: (c as ColorStop).alpha ?? 1 };
    return { hex: '#ffffff', alpha: 1 };
  });
}

export function deserializeState(raw: string): GradientState | null {
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<GradientState> & { colors?: unknown };
    return {
      ...DEFAULT_STATE,
      ...parsed,
      colors: migrateColors(parsed.colors),
    };
  } catch { return null; }
}

// ── Defaults ────────────────────────────────────────────────────────
export const DEFAULT_STATE: GradientState = {
  canvasWidth:  1200,
  canvasHeight: 675,

  colors: [
    { hex: '#0048e5', alpha: 1 },
    { hex: '#ff6030', alpha: 1 },
    { hex: '#e040fb', alpha: 1 },
    { hex: '#00c8e8', alpha: 1 },
    { hex: '#ffffff', alpha: 1 },
  ],

  renderMode: 'waves',
  material:   'standard',

  iridescence:         0.0,
  chromaticAberration: 0.0,
  refraction:          0.0,

  motionMode:      'flow',
  motionIntensity: 0.5,

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

  seed: 0,

  meshDetail:    80,
  wireframe:     false,
  targetFps:     30,
  dpr:           1,
  bgColor:       '#0a0a14',
  reducedMotion: false,
};
