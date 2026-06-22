export type SportType =
  | '100m'
  | '200m'
  | '400m'
  | 'nfl_skill'
  | 'nfl_lineman'
  | 'soccer'
  | 'basketball'
  | 'youth'
  | 'custom';

export interface AthleteProfile {
  name: string;
  weightKg: number;
  heightCm: number;
  sport: SportType;
  // Expected ranges for this athlete type
  expectedGCT_ms: [number, number];      // [min, max] ms
  expectedStepFreq_hz: [number, number]; // [min, max] Hz
  expectedTopSpeed_mph: [number, number];// [min, max] mph
  expectedGRF_BW: [number, number];      // [min, max] × bodyweight
  grfModel: 'sprint' | 'accel' | 'mixed';
}

export const SPORT_PRESETS: Record<SportType, Omit<AthleteProfile, 'name' | 'weightKg' | 'heightCm'>> = {
  '100m': {
    sport: '100m',
    expectedGCT_ms: [70, 120],
    expectedStepFreq_hz: [4.5, 5.5],
    expectedTopSpeed_mph: [20, 28],
    expectedGRF_BW: [3.0, 5.0],
    grfModel: 'sprint',
  },
  '200m': {
    sport: '200m',
    expectedGCT_ms: [80, 130],
    expectedStepFreq_hz: [4.2, 5.2],
    expectedTopSpeed_mph: [18, 26],
    expectedGRF_BW: [2.8, 4.5],
    grfModel: 'sprint',
  },
  '400m': {
    sport: '400m',
    expectedGCT_ms: [100, 160],
    expectedStepFreq_hz: [3.8, 4.8],
    expectedTopSpeed_mph: [16, 22],
    expectedGRF_BW: [2.5, 4.0],
    grfModel: 'mixed',
  },
  'nfl_skill': {
    sport: 'nfl_skill',
    expectedGCT_ms: [80, 140],
    expectedStepFreq_hz: [4.0, 5.2],
    expectedTopSpeed_mph: [18, 24],
    expectedGRF_BW: [2.8, 4.5],
    grfModel: 'sprint',
  },
  'nfl_lineman': {
    sport: 'nfl_lineman',
    expectedGCT_ms: [100, 180],
    expectedStepFreq_hz: [3.5, 4.5],
    expectedTopSpeed_mph: [14, 20],
    expectedGRF_BW: [2.5, 4.0],
    grfModel: 'accel',
  },
  'soccer': {
    sport: 'soccer',
    expectedGCT_ms: [90, 150],
    expectedStepFreq_hz: [3.8, 5.0],
    expectedTopSpeed_mph: [16, 22],
    expectedGRF_BW: [2.5, 4.2],
    grfModel: 'mixed',
  },
  'basketball': {
    sport: 'basketball',
    expectedGCT_ms: [90, 150],
    expectedStepFreq_hz: [3.8, 4.8],
    expectedTopSpeed_mph: [14, 20],
    expectedGRF_BW: [2.5, 4.0],
    grfModel: 'mixed',
  },
  'youth': {
    sport: 'youth',
    expectedGCT_ms: [100, 200],
    expectedStepFreq_hz: [3.2, 4.5],
    expectedTopSpeed_mph: [10, 18],
    expectedGRF_BW: [2.0, 3.5],
    grfModel: 'mixed',
  },
  'custom': {
    sport: 'custom',
    expectedGCT_ms: [70, 200],
    expectedStepFreq_hz: [3.0, 6.0],
    expectedTopSpeed_mph: [8, 30],
    expectedGRF_BW: [2.0, 5.5],
    grfModel: 'mixed',
  },
};

export const SPORT_LABELS: Record<SportType, string> = {
  '100m': '100m Sprinter',
  '200m': '200m Sprinter',
  '400m': '400m Runner',
  'nfl_skill': 'NFL Skill Position',
  'nfl_lineman': 'NFL Lineman',
  'soccer': 'Soccer / Football',
  'basketball': 'Basketball',
  'youth': 'Youth Athlete',
  'custom': 'Custom',
};

export function flagMetric(
  value: number,
  range: [number, number]
): 'good' | 'low' | 'high' {
  if (value < range[0]) return 'low';
  if (value > range[1]) return 'high';
  return 'good';
}

// lbs → kg
export function lbsToKg(lbs: number) { return lbs * 0.453592; }
// kg → lbs
export function kgToLbs(kg: number) { return kg * 2.20462; }
// cm → ft/in string
export function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54;
  return `${Math.floor(totalIn / 12)}'${Math.round(totalIn % 12)}"`;
}
