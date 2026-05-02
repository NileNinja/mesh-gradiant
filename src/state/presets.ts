import type { GradientState } from './GradientState';

export interface Preset {
  name: string;
  emoji: string;
  description: string;
  state: GradientState;
}

// ── Shared canvas / quality defaults ────────────────────────────────────────
const BASE: Partial<GradientState> = {
  canvasWidth: 1200, canvasHeight: 675,
  cameraFov: 45, cameraDist: 600,
  speed: 1, paused: false, meshDetail: 80, wireframe: false,
  vignette: 0, targetFps: 30, dpr: 1, bgColor: '#0a0a14',
};

// ── Helper: make a full state from a partial ─────────────────────────────────
function mk(p: Partial<GradientState>): GradientState {
  return { ...BASE, ...p } as GradientState;
}

export const PRESETS: Preset[] = [
  // ── 1. Stripe Classic ── smooth flowing Stripe.com gradient ───────────────
  {
    name: 'Stripe Classic',
    emoji: '🌈',
    description: 'The original Stripe homepage gradient — blue, coral, pink, cyan',
    state: mk({
      colors: ['#0048e5', '#ff6030', '#e040fb', '#00c8e8', '#ffffff'],
      positionX: 0, positionY: 0, positionZ: 0,
      scaleX: 8.0, scaleY: 4.0, scaleZ: 8.0,
      rotationX: -0.35, rotationY: -0.08, rotationZ: 0.5,
      displaceFreqX: 0.0045, displaceFreqZ: 0.009, displaceAmount: -8.0,
      // Gentle twist — creates flowing ribbon motion without hard edges
      twistFreqX: -0.35, twistFreqY: 0.2,  twistFreqZ: -0.3,
      twistPowX:  1.5,   twistPowY: 0.4,   twistPowZ:  1.5,
      colorContrast: 1.0, colorSaturation: 1.1, colorHueShift: -0.1,
      glowAmount: 1.5, glowPower: 0.6, glowRamp: 0.7,
      blur: 0.01, grain: 0.8, bgColor: '#060820',
    }),
  },

  // ── 2. Stripe Midnight ── dark, electric blue/violet ─────────────────────
  {
    name: 'Midnight',
    emoji: '🌑',
    description: 'Dark navy canvas · electric blue, indigo, deep violet',
    state: mk({
      colors: ['#0d0d20', '#1a237e', '#3d5afe', '#7c4dff', '#b39ddb'],
      positionX:0, positionY:-30, positionZ:0,
      scaleX:6.5, scaleY:9.0, scaleZ:5.5,
      rotationX:-0.50, rotationY:0.08, rotationZ:1.92,
      displaceFreqX:0.007, displaceFreqZ:0.018, displaceAmount:-9.0,
      twistFreqX:-0.70, twistFreqY:0.35, twistFreqZ:-0.62,
      twistPowX:4.0,    twistPowY:0.8,   twistPowZ:3.5,
      colorContrast:1.2, colorSaturation:1.4, colorHueShift:0.0,
      glowAmount:2.8,  glowPower:0.72, glowRamp:0.9,
      blur:0.0, grain:0.9, vignette:0.55,
    }),
  },

  // ── 3. Aurora Borealis ─────────────────────────────────────────────────────
  {
    name: 'Aurora',
    emoji: '🌌',
    description: 'Dark · emerald green, teal, violet northern lights',
    state: mk({
      colors: ['#0a1628', '#00695c', '#00e5ff', '#7c4dff', '#e0f7fa'],
      positionX:0, positionY:20, positionZ:0,
      scaleX:8.0, scaleY:7.0, scaleZ:7.0,
      rotationX:-0.38, rotationY:0.15, rotationZ:1.75,
      displaceFreqX:0.0065, displaceFreqZ:0.014, displaceAmount:-8.5,
      twistFreqX:-0.55, twistFreqY:0.45, twistFreqZ:-0.50,
      twistPowX:3.2,    twistPowY:1.0,   twistPowZ:3.8,
      colorContrast:1.1, colorSaturation:1.3, colorHueShift:0.05,
      glowAmount:2.2, glowPower:0.78, glowRamp:0.85,
      blur:0.0, grain:0.75, vignette:0.65,
    }),
  },

  // ── 4. Sunset ─────────────────────────────────────────────────────────────
  {
    name: 'Sunset',
    emoji: '🌅',
    description: 'Warm dusk · deep orange, magenta, amber, gold',
    state: mk({
      colors: ['#1a0510', '#b71c1c', '#ff6d00', '#ffd600', '#ffecb3'],
      positionX:0, positionY:-10, positionZ:0,
      scaleX:7.5, scaleY:8.5, scaleZ:6.0,
      rotationX:-0.42, rotationY:-0.20, rotationZ:1.80,
      displaceFreqX:0.006, displaceFreqZ:0.015, displaceAmount:-8.2,
      twistFreqX:-0.60, twistFreqY:0.38, twistFreqZ:-0.55,
      twistPowX:3.8,    twistPowY:0.65,  twistPowZ:4.1,
      colorContrast:1.15, colorSaturation:1.25, colorHueShift:0.02,
      glowAmount:2.1, glowPower:0.82, glowRamp:0.80,
      blur:0.03, grain:0.9, vignette:0.4,
    }),
  },

  // ── 5. Ocean ──────────────────────────────────────────────────────────────
  {
    name: 'Ocean',
    emoji: '🌊',
    description: 'Deep sea · cobalt, cerulean, aquamarine, white foam',
    state: mk({
      colors: ['#01579b', '#0288d1', '#00bcd4', '#80deea', '#ffffff'],
      positionX:0, positionY:10, positionZ:0,
      scaleX:6.0, scaleY:9.5, scaleZ:5.0,
      rotationX:-0.52, rotationY:-0.05, rotationZ:1.95,
      displaceFreqX:0.0055, displaceFreqZ:0.017, displaceAmount:-10.0,
      twistFreqX:-0.72, twistFreqY:0.42, twistFreqZ:-0.65,
      twistPowX:2.8,    twistPowY:0.9,   twistPowZ:3.2,
      colorContrast:1.0, colorSaturation:1.2, colorHueShift:0.0,
      glowAmount:1.5, glowPower:0.85, glowRamp:0.78,
      blur:0.04, grain:0.65, vignette:0.5,
    }),
  },

  // ── 6. Nebula ─────────────────────────────────────────────────────────────
  {
    name: 'Nebula',
    emoji: '🔮',
    description: 'Deep space · purple, magenta, blue cosmic dust',
    state: mk({
      colors: ['#0d0010', '#4a148c', '#e91e63', '#3f51b5', '#ff80ab'],
      positionX:0, positionY:0, positionZ:0,
      scaleX:8.5, scaleY:7.5, scaleZ:7.5,
      rotationX:-0.40, rotationY:0.12, rotationZ:2.10,
      displaceFreqX:0.0072, displaceFreqZ:0.019, displaceAmount:-7.2,
      twistFreqX:-0.58, twistFreqY:0.50, twistFreqZ:-0.48,
      twistPowX:4.5,    twistPowY:0.6,   twistPowZ:4.2,
      colorContrast:1.3, colorSaturation:1.5, colorHueShift:-0.08,
      glowAmount:3.2, glowPower:0.70, glowRamp:0.92,
      blur:0.0, grain:1.2, vignette:0.80,
    }),
  },

  // ── 7. Neon Cyber ─────────────────────────────────────────────────────────
  {
    name: 'Neon Cyber',
    emoji: '⚡',
    description: 'Cyberpunk · electric cyan, hot magenta, acid green',
    state: mk({
      colors: ['#050010', '#00e5ff', '#ff00ff', '#76ff03', '#ffffff'],
      positionX:0, positionY:0, positionZ:0,
      scaleX:9.0, scaleY:6.0, scaleZ:8.0,
      rotationX:-0.35, rotationY:0.22, rotationZ:1.65,
      displaceFreqX:0.009, displaceFreqZ:0.022, displaceAmount:-6.5,
      twistFreqX:-0.80, twistFreqY:0.55, twistFreqZ:-0.75,
      twistPowX:5.0,    twistPowY:0.5,   twistPowZ:5.2,
      colorContrast:1.4, colorSaturation:1.8, colorHueShift:0.0,
      glowAmount:4.0, glowPower:0.65, glowRamp:0.95,
      blur:0.0, grain:0.6, vignette:1.0,
    }),
  },

  // ── 8. Peach Blossom ── light, airy, feminine ─────────────────────────────
  {
    name: 'Peach Blossom',
    emoji: '🌸',
    description: 'Soft light · blush pink, peach, lavender, ivory',
    state: mk({
      colors: ['#fce4ec', '#f48fb1', '#ce93d8', '#ffcc80', '#ffffff'],
      positionX:0, positionY:20, positionZ:0,
      scaleX:5.5, scaleY:7.0, scaleZ:5.0,
      rotationX:-0.35, rotationY:-0.08, rotationZ:1.70,
      displaceFreqX:0.005, displaceFreqZ:0.013, displaceAmount:-6.0,
      twistFreqX:-0.45, twistFreqY:0.32, twistFreqZ:-0.42,
      twistPowX:2.5,    twistPowY:0.55,  twistPowZ:2.8,
      colorContrast:0.9, colorSaturation:0.85, colorHueShift:0.0,
      glowAmount:1.0, glowPower:0.9, glowRamp:0.7,
      blur:0.05, grain:0.4, vignette:0.0,
    }),
  },

  // ── 9. Emerald Forest ─────────────────────────────────────────────────────
  {
    name: 'Forest',
    emoji: '🌿',
    description: 'Organic · deep forest green, moss, amber earth tones',
    state: mk({
      colors: ['#1b2510', '#2e7d32', '#66bb6a', '#ff8f00', '#fff9c4'],
      positionX:0, positionY:-5, positionZ:0,
      scaleX:6.8, scaleY:8.2, scaleZ:6.2,
      rotationX:-0.48, rotationY:-0.15, rotationZ:1.82,
      displaceFreqX:0.0062, displaceFreqZ:0.015, displaceAmount:-8.0,
      twistFreqX:-0.62, twistFreqY:0.40, twistFreqZ:-0.55,
      twistPowX:3.5,    twistPowY:0.75,  twistPowZ:3.7,
      colorContrast:1.05, colorSaturation:1.1, colorHueShift:0.03,
      glowAmount:1.2, glowPower:0.88, glowRamp:0.75,
      blur:0.02, grain:0.8, vignette:0.45,
    }),
  },

  // ── 10. Retro Gold ────────────────────────────────────────────────────────
  {
    name: 'Retro Gold',
    emoji: '🏆',
    description: 'Luxe warm · deep burgundy, gold, amber, cream',
    state: mk({
      colors: ['#1a0505', '#880e4f', '#e65100', '#ffd600', '#fff8e1'],
      positionX:0, positionY:0, positionZ:0,
      scaleX:7.0, scaleY:8.0, scaleZ:6.5,
      rotationX:-0.43, rotationY:-0.10, rotationZ:1.90,
      displaceFreqX:0.006, displaceFreqZ:0.016, displaceAmount:-7.5,
      twistFreqX:-0.66, twistFreqY:0.38, twistFreqZ:-0.60,
      twistPowX:3.7,    twistPowY:0.72,  twistPowZ:3.9,
      colorContrast:1.1, colorSaturation:1.15, colorHueShift:0.05,
      glowAmount:2.0, glowPower:0.80, glowRamp:0.82,
      blur:0.02, grain:0.95, vignette:0.35,
    }),
  },
];
