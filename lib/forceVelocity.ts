/**
 * Morin & Samozino (2012) Force-Velocity Profile
 * The gold standard for sprint mechanical profiling.
 *
 * Gives you:
 *   F0   — theoretical max horizontal force (N/kg) — force capability at zero velocity
 *   V0   — theoretical max velocity (m/s) — velocity capability at zero force
 *   Pmax — max mechanical power output (W/kg)
 *   Sfv  — F-v slope (N·s/kg/m) — negative = force-oriented, positive bias = velocity-oriented
 *   FVimb — force-velocity imbalance % — how far from optimal profile
 *   RFmax — max ratio of forces (%) — peak horizontal effectiveness
 *   DRF  — decrease in ratio of forces (% per m/s) — how fast effectiveness drops
 */

export interface FVPoint {
  velocity: number;  // m/s
  force: number;     // N/kg (relative to BW)
}

export interface FVProfile {
  F0: number;        // N/kg — max theoretical force at zero velocity
  V0: number;        // m/s — max theoretical velocity at zero force
  Pmax: number;      // W/kg — max power
  Sfv: number;       // N·s/kg/m — slope (negative)
  FVimbalance: number; // % — positive = force deficit, negative = velocity deficit
  RFmax: number;     // % — peak ratio of horizontal to total force
  DRF: number;       // %/m/s — slope of ratio of forces decline
  points: FVPoint[]; // raw data points for chart
  r2: number;        // goodness of fit (0-1)
  profile: 'force-oriented' | 'balanced' | 'velocity-oriented';
  recommendation: string;
}

export interface SplitTime {
  distance: number; // meters
  time: number;     // seconds
}

/**
 * Compute F-v profile from per-step data (video-only, no split times needed)
 * Uses step-by-step speed estimates and Morin's impulse-based approach
 */
export function computeFVProfile(
  stepSpeeds_ms: number[],   // per-step instantaneous speed (m/s)
  stepTimes: number[],       // per-step stride time (s)
  bodyWeightKg: number,
  gcts: number[],            // ground contact times (s)
  airTimes: number[],        // air times (s)
): FVProfile | null {
  if (stepSpeeds_ms.length < 4) return null;

  const g = 9.81;
  const points: FVPoint[] = [];

  for (let i = 1; i < stepSpeeds_ms.length; i++) {
    const v = (stepSpeeds_ms[i] + stepSpeeds_ms[i - 1]) / 2; // mid-step velocity
    if (v <= 0) continue;

    // Net horizontal force from Newton's 2nd law: F_net = m × a
    const dt = stepTimes[i] ?? 0.2;
    const a = (stepSpeeds_ms[i] - stepSpeeds_ms[i - 1]) / Math.max(dt, 0.05);

    // Total GRF (Morin model)
    const tc = gcts[i] ?? 0.12;
    const ta = airTimes[i] ?? 0.10;
    const Ftotal = (Math.PI / 2) * g * (tc + ta) / tc; // N/kg

    // Horizontal component: F_h = net forward force + aerodynamic drag
    // F_h ≈ a + k×v² (drag) where k≈0.0033 for sprinting outdoors
    const drag = 0.0033 * v * v;
    const F_h = Math.max(0, a + drag); // N/kg

    // Ratio of forces (RF) = horizontal/total
    if (Ftotal > 0 && F_h > 0) {
      points.push({ velocity: v, force: F_h });
    }
  }

  if (points.length < 3) return null;

  // Linear regression on F-v data: F = F0 + Sfv × v
  const { slope, intercept, r2 } = linearRegression(
    points.map(p => p.velocity),
    points.map(p => p.force)
  );

  const F0 = Math.max(0.1, intercept);           // N/kg — y-intercept
  const Sfv = slope;                              // negative slope
  const V0 = Sfv < 0 ? -F0 / Sfv : 10;          // m/s — x-intercept
  const Pmax = (F0 * V0) / 4;                    // W/kg — max power at optimal load

  // Ratio of forces analysis
  const RFvalues = points.map(p => p.force / (g) * 100); // as % of BW-equivalent
  const RFmax = Math.max(...RFvalues);

  // DRF: slope of RF vs velocity
  const { slope: drfSlope } = linearRegression(
    points.map(p => p.velocity),
    RFvalues
  );
  const DRF = drfSlope; // %/m/s — should be negative (RF decreases as v increases)

  // F-v imbalance: compare actual Sfv to theoretical optimal
  // Morin (2011): optimal Sfv = -F0/V0 × 1.0 (perfectly balanced)
  // FVimb > 0 → force deficit (needs more force training)
  // FVimb < 0 → velocity deficit (needs more velocity/power training)
  const Sfv_optimal = -(F0 / V0);
  const FVimbalance = Sfv_optimal !== 0
    ? Math.round(((Sfv - Sfv_optimal) / Math.abs(Sfv_optimal)) * 100)
    : 0;

  let profile: FVProfile['profile'];
  let recommendation: string;

  if (FVimbalance > 25) {
    profile = 'velocity-oriented';
    recommendation = 'Velocity deficit — prioritize heavy sled training, weight room strength work, and resisted sprints to build horizontal force production.';
  } else if (FVimbalance < -25) {
    profile = 'force-oriented';
    recommendation = 'Force deficit — prioritize light sled, plyometrics, and flying sprints to develop velocity and power expression at high speeds.';
  } else {
    profile = 'balanced';
    recommendation = 'Well-balanced F-v profile. Maintain training variety. Focus on Pmax exercises (moderate load, explosive intent).';
  }

  return {
    F0: Math.round(F0 * 100) / 100,
    V0: Math.round(V0 * 100) / 100,
    Pmax: Math.round(Pmax * 100) / 100,
    Sfv: Math.round(Sfv * 1000) / 1000,
    FVimbalance,
    RFmax: Math.round(RFmax * 10) / 10,
    DRF: Math.round(DRF * 100) / 100,
    points,
    r2: Math.round(r2 * 100) / 100,
    profile,
    recommendation,
  };
}

/**
 * Enhanced F-v profile using optional split times (Morin 2012 full method)
 * More accurate when you have actual measured splits
 */
export function computeFVProfileFromSplits(
  splits: SplitTime[],
  bodyWeightKg: number,
  gcts: number[],
  airTimes: number[],
): FVProfile | null {
  if (splits.length < 3) return null;

  const g = 9.81;
  const points: FVPoint[] = [];

  // Compute instantaneous speed between each split interval
  for (let i = 1; i < splits.length; i++) {
    const dx = splits[i].distance - splits[i - 1].distance;
    const dt = splits[i].time - splits[i - 1].time;
    if (dt <= 0 || dx <= 0) continue;

    const v = dx / dt; // avg speed over this interval
    const a = i > 1
      ? ((splits[i].distance - splits[i-1].distance) / (splits[i].time - splits[i-1].time)
       - (splits[i-1].distance - splits[i-2].distance) / (splits[i-1].time - splits[i-2].time))
       / dt
      : v / splits[i].time;

    const tc = gcts[Math.min(i - 1, gcts.length - 1)] ?? 0.12;
    const ta = airTimes[Math.min(i - 1, airTimes.length - 1)] ?? 0.10;
    const drag = 0.0033 * v * v;
    const F_h = Math.max(0, a + drag);

    if (F_h > 0 && v > 0) {
      points.push({ velocity: v, force: F_h });
    }
  }

  if (points.length < 2) return null;

  const { slope, intercept, r2 } = linearRegression(
    points.map(p => p.velocity),
    points.map(p => p.force)
  );

  const F0 = Math.max(0.1, intercept);
  const Sfv = slope;
  const V0 = Sfv < 0 ? -F0 / Sfv : 12;
  const Pmax = (F0 * V0) / 4;

  const RFvalues = points.map(p => (p.force / g) * 100);
  const RFmax = Math.max(...RFvalues);
  const { slope: drfSlope } = linearRegression(points.map(p => p.velocity), RFvalues);

  const Sfv_optimal = -(F0 / V0);
  const FVimbalance = Sfv_optimal !== 0
    ? Math.round(((Sfv - Sfv_optimal) / Math.abs(Sfv_optimal)) * 100)
    : 0;

  const profile: FVProfile['profile'] = FVimbalance > 25 ? 'velocity-oriented' : FVimbalance < -25 ? 'force-oriented' : 'balanced';
  const recommendation = FVimbalance > 25
    ? 'Velocity deficit — heavy sled, strength work, resisted sprints.'
    : FVimbalance < -25
    ? 'Force deficit — light sled, plyometrics, flying sprints.'
    : 'Balanced profile — maintain training variety, focus on Pmax.';

  return { F0: Math.round(F0 * 100) / 100, V0: Math.round(V0 * 100) / 100, Pmax: Math.round(Pmax * 100) / 100, Sfv: Math.round(Sfv * 1000) / 1000, FVimbalance, RFmax: Math.round(RFmax * 10) / 10, DRF: Math.round(drfSlope * 100) / 100, points, r2: Math.round(r2 * 100) / 100, profile, recommendation };
}

/** Weyand et al. (2000) — top speed is set by Fmax/BW during contact */
export interface WeyandMetrics {
  Fmax_BW: number;      // peak GRF as multiple of BW — the key limiter
  Fmax_lbs: number;     // peak GRF in lbs
  Fmax_N: number;       // peak GRF in Newtons
  contactMechEff: number; // mechanical effectiveness during contact (%)
  topSpeedLimit: number;  // theoretical max speed this athlete could reach (mph)
  limitingFactor: 'contact-time' | 'force' | 'balanced';
  insight: string;
}

export function computeWeyandMetrics(
  avgGCT_s: number,
  avgAirTime_s: number,
  topSpeed_ms: number,
  bodyWeightKg: number
): WeyandMetrics {
  const g = 9.81;
  const BW = bodyWeightKg * g;
  const strideTime = avgGCT_s + avgAirTime_s;

  // Weyand: Fmax = BW × strideTime / GCT × π/2
  const Fmax_N = (Math.PI / 2) * BW * (strideTime / Math.max(avgGCT_s, 0.05));
  const Fmax_BW = Fmax_N / BW;
  const Fmax_lbs = Fmax_N * 0.224809;

  // Mechanical effectiveness during contact
  const contactMechEff = Math.round((1 / Fmax_BW) * 100 * 10) / 10;

  // Theoretical max speed: Vmax = Fmax/BW × g × tc_min
  // At absolute limit, GCT ≈ 0.075s (Bolt level)
  const tc_min = 0.075;
  const topSpeedLimit_ms = (Fmax_N / BW) * g * tc_min / g;
  const topSpeedLimit_mph = Math.round(topSpeedLimit_ms * 2.23694 * 10) / 10;

  // Limiting factor analysis
  // If GCT is long relative to air time → contact-time limited (need faster legs)
  // If Fmax/BW is low → force limited (need more strength)
  const gctRatio = avgGCT_s / strideTime;
  const limitingFactor: WeyandMetrics['limitingFactor'] =
    gctRatio > 0.55 ? 'contact-time' :
    Fmax_BW < 2.5 ? 'force' : 'balanced';

  const insight =
    limitingFactor === 'contact-time'
      ? `GCT is ${Math.round(avgGCT_s * 1000)}ms — too long relative to air time. Reducing contact time is the #1 priority to increase top speed.`
      : limitingFactor === 'force'
      ? `Peak GRF is ${Math.round(Fmax_BW * 10) / 10}× BW — below elite threshold (3.5–5×). Increasing vertical force production will directly raise top speed.`
      : `Good balance of force and contact time. Elite sprinters typically show 4–5× BW in ${Math.round(avgGCT_s * 1000)}–${Math.round(avgGCT_s * 1000) + 15}ms.`;

  return {
    Fmax_BW: Math.round(Fmax_BW * 100) / 100,
    Fmax_lbs: Math.round(Fmax_lbs),
    Fmax_N: Math.round(Fmax_N),
    contactMechEff,
    topSpeedLimit: topSpeedLimit_mph,
    limitingFactor,
    insight,
  };
}

// ── Linear regression helper ─────────────────────────────────────────────────
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0);
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const ssRes = y.reduce((s, yi, i) => s + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2: Math.max(0, r2) };
}
