import type { GradientState, MotionMode } from './GradientState';

export const MOTION_MODES: Record<MotionMode, Partial<GradientState>> = {
  flow: {
    speed: 1.0,
    displaceFreqX: 0.0058, displaceFreqZ: 0.016,  displaceAmount: -7.8,
    twistFreqX: -0.65, twistFreqY:  0.41, twistFreqZ: -0.58,
    twistPowX:   3.63, twistPowY:   0.70, twistPowZ:   3.95,
    motionIntensity: 0.5,
  },
  drift: {
    speed: 0.3,
    displaceFreqX: 0.003,  displaceFreqZ: 0.008,  displaceAmount: -12.0,
    twistFreqX: -0.30, twistFreqY:  0.15, twistFreqZ: -0.25,
    twistPowX:   1.5,  twistPowY:   0.30, twistPowZ:   1.5,
    motionIntensity: 0.3,
  },
  swirl: {
    speed: 1.2,
    displaceFreqX: 0.008,  displaceFreqZ: 0.020,  displaceAmount: -6.0,
    twistFreqX: -1.20, twistFreqY:  0.80, twistFreqZ: -1.00,
    twistPowX:   5.50, twistPowY:   1.80, twistPowZ:   5.00,
    motionIntensity: 0.8,
  },
  ripple: {
    speed: 1.5,
    displaceFreqX: 0.005,  displaceFreqZ: 0.012,  displaceAmount: -8.5,
    twistFreqX: -0.40, twistFreqY:  0.25, twistFreqZ: -0.35,
    twistPowX:   2.00, twistPowY:   0.50, twistPowZ:   2.00,
    motionIntensity: 0.7,
  },
  pulse: {
    speed: 0.8,
    displaceFreqX: 0.006,  displaceFreqZ: 0.014,  displaceAmount: -9.0,
    twistFreqX: -0.50, twistFreqY:  0.30, twistFreqZ: -0.45,
    twistPowX:   2.50, twistPowY:   0.60, twistPowZ:   2.50,
    motionIntensity: 0.6,
  },
  breathe: {
    speed: 0.5,
    displaceFreqX: 0.004,  displaceFreqZ: 0.010,  displaceAmount: -10.0,
    twistFreqX: -0.35, twistFreqY:  0.20, twistFreqZ: -0.30,
    twistPowX:   1.80, twistPowY:   0.40, twistPowZ:   1.80,
    motionIntensity: 0.4,
  },
  aurora: {
    speed: 0.7,
    displaceFreqX: 0.0045, displaceFreqZ: 0.011,  displaceAmount: -11.0,
    twistFreqX: -0.45, twistFreqY:  0.60, twistFreqZ: -0.40,
    twistPowX:   2.80, twistPowY:   1.50, twistPowZ:   2.80,
    motionIntensity: 0.5,
  },
  custom: {},  // preserves whatever values the user has tuned
};

export const MOTION_MODE_LABELS: Record<MotionMode, string> = {
  flow:    '〰 Flow',
  drift:   '🌊 Drift',
  swirl:   '🌀 Swirl',
  ripple:  '💧 Ripple',
  pulse:   '💓 Pulse',
  breathe: '🫁 Breathe',
  aurora:  '🌌 Aurora',
  custom:  '✏️ Custom',
};
