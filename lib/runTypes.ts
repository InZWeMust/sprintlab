// Run type definitions, phase models, and expected ranges

export type RunType = 'blocks' | 'standing' | 'fly' | 'resisted';

export interface RunTypeConfig {
  label: string;
  icon: string;
  description: string;
  // Which phase the video starts in
  startPhase: 'acceleration' | 'max-velocity';
  // Expected GCT range in ms
  gct_ms: [number, number];
  // Expected step freq Hz
  freq_hz: [number, number];
  // Expected air time ms
  air_ms: [number, number];
  // GCT at top speed
  topSpeedGCT_ms: [number, number];
  // Typical shin angle at first ground contact (degrees from vertical)
  shinAngle_deg?: [number, number];
  // Whether to show F-v profile
  showFvProfile: boolean;
  // Whether Weyand max-velocity model applies
  showWeyand: boolean;
  // Speed variation expected across run
  speedVariation: 'high' | 'moderate' | 'low';
}

export const RUN_TYPE_CONFIG: Record<RunType, RunTypeConfig> = {
  blocks: {
    label: 'Block Start',
    icon: '🏁',
    description: 'Starting from blocks — full acceleration from zero',
    startPhase: 'acceleration',
    gct_ms: [100, 300],
    freq_hz: [3.5, 5.5],
    air_ms: [0, 200],
    topSpeedGCT_ms: [75, 120],
    shinAngle_deg: [35, 55], // aggressive forward lean early
    showFvProfile: true,
    showWeyand: true,
    speedVariation: 'high',
  },
  standing: {
    label: 'Standing Start',
    icon: '🚀',
    description: 'Starting from a stand — no blocks',
    startPhase: 'acceleration',
    gct_ms: [110, 280],
    freq_hz: [3.5, 5.2],
    air_ms: [0, 180],
    topSpeedGCT_ms: [75, 130],
    shinAngle_deg: [40, 60],
    showFvProfile: true,
    showWeyand: true,
    speedVariation: 'high',
  },
  fly: {
    label: 'Flying / Top Speed',
    icon: '⚡',
    description: 'Already at full speed when entering the frame',
    startPhase: 'max-velocity',
    gct_ms: [75, 120],
    freq_hz: [4.5, 5.8],
    air_ms: [90, 200],
    topSpeedGCT_ms: [75, 120],
    showFvProfile: false,
    showWeyand: true,
    speedVariation: 'low',
  },
  resisted: {
    label: 'Resisted (Sled/Band)',
    icon: '🔗',
    description: 'Sprint against resistance — sled, band, or parachute',
    startPhase: 'acceleration',
    gct_ms: [120, 300],
    freq_hz: [3.0, 4.8],
    air_ms: [0, 120],
    topSpeedGCT_ms: [100, 180],
    shinAngle_deg: [20, 45], // more horizontal
    showFvProfile: true,
    showWeyand: false,
    speedVariation: 'moderate',
  },
};

// ── Sprint phase detection ───────────────────────────────────────────────────
export type SprintPhase = 'drive' | 'acceleration' | 'max-velocity' | 'speed-endurance';

export interface PhaseBreakdown {
  phase: SprintPhase;
  stepStart: number;
  stepEnd: number;
  label: string;
  color: string;
}

export function detectPhases(
  stepsCount: number,
  runType: RunType,
  runDistanceM: number
): PhaseBreakdown[] {
  if (runType === 'fly') {
    return [{ phase: 'max-velocity', stepStart: 0, stepEnd: stepsCount - 1, label: 'Max Velocity', color: '#f59e0b' }];
  }

  if (runType === 'resisted') {
    return [{ phase: 'drive', stepStart: 0, stepEnd: stepsCount - 1, label: 'Resisted Drive', color: '#ef4444' }];
  }

  const phases: PhaseBreakdown[] = [];

  if (runDistanceM <= 10) {
    // Short: all drive/early acceleration
    phases.push({ phase: 'drive', stepStart: 0, stepEnd: Math.min(3, stepsCount - 1), label: 'Drive Phase (1–3)', color: '#ef4444' });
    if (stepsCount > 3) phases.push({ phase: 'acceleration', stepStart: 4, stepEnd: stepsCount - 1, label: 'Early Acceleration', color: '#f97316' });
  } else if (runDistanceM <= 30) {
    // 20-30m: drive → acceleration
    phases.push({ phase: 'drive', stepStart: 0, stepEnd: Math.min(3, stepsCount - 1), label: 'Drive Phase (1–3)', color: '#ef4444' });
    if (stepsCount > 4) phases.push({ phase: 'acceleration', stepStart: 4, stepEnd: stepsCount - 1, label: 'Acceleration', color: '#f97316' });
  } else if (runDistanceM <= 60) {
    // 40-60m: drive → accel → early max-v
    phases.push({ phase: 'drive', stepStart: 0, stepEnd: Math.min(3, stepsCount - 1), label: 'Drive Phase (1–3)', color: '#ef4444' });
    if (stepsCount > 4) phases.push({ phase: 'acceleration', stepStart: 4, stepEnd: Math.min(Math.floor(stepsCount * 0.6), stepsCount - 1), label: 'Acceleration', color: '#f97316' });
    if (stepsCount > 8) phases.push({ phase: 'max-velocity', stepStart: Math.floor(stepsCount * 0.6), stepEnd: stepsCount - 1, label: 'Max Velocity', color: '#f59e0b' });
  } else {
    // 100m: all 4 phases
    phases.push({ phase: 'drive', stepStart: 0, stepEnd: Math.min(3, stepsCount - 1), label: 'Drive Phase (1–3)', color: '#ef4444' });
    if (stepsCount > 4) phases.push({ phase: 'acceleration', stepStart: 4, stepEnd: Math.min(Math.floor(stepsCount * 0.35), stepsCount - 1), label: 'Acceleration', color: '#f97316' });
    if (stepsCount > 10) phases.push({ phase: 'max-velocity', stepStart: Math.floor(stepsCount * 0.35), stepEnd: Math.min(Math.floor(stepsCount * 0.7), stepsCount - 1), label: 'Max Velocity', color: '#f59e0b' });
    if (stepsCount > 18) phases.push({ phase: 'speed-endurance', stepStart: Math.floor(stepsCount * 0.7), stepEnd: stepsCount - 1, label: 'Speed Endurance', color: '#22c55e' });
  }

  return phases;
}

// Auto-detect run type from speed curve shape
export function autoDetectRunType(stepSpeeds: number[]): RunType {
  if (stepSpeeds.length < 3) return 'fly';
  const first = stepSpeeds.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last = stepSpeeds.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const variation = (last - first) / first;
  // If first 3 steps are within 15% of last 3 → flying run
  return variation < 0.15 ? 'fly' : 'blocks';
}
