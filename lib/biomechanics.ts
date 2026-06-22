export interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface Pose {
  keypoints: Keypoint[];
  score?: number;
}

export interface StepData {
  stepNum: number;
  foot: 'Left' | 'Right';
  groundContactTime: number;   // seconds — touchdown to toe-off
  swingTime: number;           // seconds — toe-off to next same-foot touchdown
  airTime: number;             // seconds — toe-off to opposite foot touchdown (flight)
  stepLength: number;          // meters
  stepFrequency: number;       // Hz
  driveIndex: number;
  hipDisplacement: number;     // meters
  peakGRF_BW: number;         // × bodyweight
  forceNewtons: number;
  frameIndex: number;          // frame of touchdown
  toeOffFrame: number;         // frame of toe-off
  instantSpeed_mph: number;
}

export interface RunMetrics {
  // Summary
  avgStepLengthRight: number;
  avgStepLengthLeft: number;
  avgStepLength: number;
  avgFreqRight: number;
  avgFreqLeft: number;
  avgGCT_Right: number;
  avgGCT_Left: number;
  avgSwingRight: number;
  avgSwingLeft: number;
  avgAirRight: number;
  avgAirLeft: number;
  runTime: number;
  totalSteps: number;
  // Speed — using distance/steps method (friend's formula)
  avgSpeed_ms: number;
  maxSpeed_ms: number;
  minSpeed_ms: number;
  avgSpeed_mph: number;
  maxSpeed_mph: number;
  // Force
  startForce_lbs: number;
  startForce_N: number;
  peakAccel_ms2: number;
  // Asymmetry
  asymmetryPct: number;
  gctAsymmetryPct: number;
  // Per step
  steps: StepData[];
  // Curves
  speedCurve: { t: number; v: number }[];
  accelCurve: { t: number; a: number }[];
}

export function getAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / (magAB * magCB)))) * 180) / Math.PI;
}

export function getJointAngles(pose: Pose) {
  const kp = pose.keypoints;
  const get = (name: string) => kp.find(k => k.name === name) ?? { x: 0, y: 0, score: 0 };
  return {
    leftKnee: getAngle(get('left_hip'), get('left_knee'), get('left_ankle')),
    rightKnee: getAngle(get('right_hip'), get('right_knee'), get('right_ankle')),
    leftHip: getAngle(get('left_shoulder'), get('left_hip'), get('left_knee')),
    rightHip: getAngle(get('right_shoulder'), get('right_hip'), get('right_knee')),
    trunkLean: getTrunkLean(get('left_shoulder'), get('right_shoulder'), get('left_hip'), get('right_hip')),
  };
}

function getTrunkLean(ls: Keypoint, rs: Keypoint, lh: Keypoint, rh: Keypoint): number {
  const sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
  const hx = (lh.x + rh.x) / 2, hy = (lh.y + rh.y) / 2;
  return Math.atan2(sx - hx, -(sy - hy)) * (180 / Math.PI);
}

// ─── GCT floor/ceiling (biomechanically valid range) ───────────────────────
const GCT_MIN = 0.075;  // 75ms — Bolt-level floor, below = detection error
const GCT_MAX = 0.40;   // 400ms — above = walking or detection error
const AIR_MIN = 0.05;   // 50ms minimum flight time
const AIR_MAX = 0.45;   // 450ms maximum flight time

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function computeRunMetrics(
  poses: Pose[],
  fps: number,
  bodyWeightKg: number,
  pixelsPerMeter: number,   // still used for hip displacement only
  runDistanceM: number
): RunMetrics {
  const g = 9.81;
  const BW = bodyWeightKg * g; // bodyweight in Newtons
  const totalFrames = poses.length;
  const runTime = totalFrames / fps;

  const leftAnkleY  = poses.map(p => p.keypoints.find(k => k.name === 'left_ankle')?.y  ?? 0);
  const rightAnkleY = poses.map(p => p.keypoints.find(k => k.name === 'right_ankle')?.y ?? 0);
  const leftHipY    = poses.map(p => p.keypoints.find(k => k.name === 'left_hip')?.y    ?? 0);
  const rightHipY   = poses.map(p => p.keypoints.find(k => k.name === 'right_hip')?.y   ?? 0);

  const contacts = detectContacts(leftAnkleY, rightAnkleY, fps);

  // ── Speed from distance + steps (your friend's formula) ──────────────────
  // avg_step_length = run_distance / total_steps
  // avg_step_freq   = total_steps / run_time
  // avg_speed       = avg_step_length × avg_step_freq  ← (= run_distance / run_time, same thing)
  const totalSteps = Math.max(1, contacts.length);
  const avgStepLength_m = runDistanceM / totalSteps;
  const avgStepFreq_hz  = totalSteps / runTime;
  const avgSpeed_ms     = avgStepLength_m * avgStepFreq_hz; // = runDistanceM / runTime

  const steps: StepData[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const next = i + 1 < contacts.length ? contacts[i + 1] : null;

    // GCT: touchdown frame → toe-off frame
    const gctRaw = c.duration / fps;
    const gct = clamp(gctRaw, GCT_MIN, GCT_MAX);
    const toeOffFrame = c.start + c.duration;

    // Air time: toe-off → next foot's touchdown (flight phase)
    const airRaw = next ? (next.start - toeOffFrame) / fps : gct;
    const airTime = clamp(airRaw, AIR_MIN, AIR_MAX);

    // Swing time: toe-off → same foot's next touchdown
    // Find next contact on same foot
    const sameFoot = contacts.slice(i + 2).find(ct => ct.foot === c.foot);
    const swingRaw = sameFoot ? (sameFoot.start - toeOffFrame) / fps : airTime * 2;
    const swingTime = clamp(swingRaw, 0.1, 0.8);

    // Per-step speed estimate (Morin)
    const strideTime = gct + airTime;
    const stepFreq = 1 / strideTime;

    // Step length: scale relative to average based on step time
    // Faster steps (shorter time) = longer distance covered
    const stepLength = clamp(avgSpeed_ms / stepFreq, 0.3, 3.5);

    // GRF: Morin et al. — only needs GCT and air time, no pixel calibration
    // peak_GRF = (π/2) × BW × (GCT + airTime) / GCT
    const peakGRF_N  = (Math.PI / 2) * BW * (strideTime / gct);
    const peakGRF_BW = peakGRF_N / BW;

    // Hip vertical displacement (still uses pixels — for relative comparison only)
    const hipY = c.foot === 'Left' ? leftHipY : rightHipY;
    const slice = hipY.slice(c.start, toeOffFrame);
    const hipDisp = slice.length && pixelsPerMeter > 0
      ? (Math.max(...slice) - Math.min(...slice)) / pixelsPerMeter
      : 0;

    // Trunk lean → drive index
    const angles = poses[c.start]?.keypoints.length ? getJointAngles(poses[c.start]) : null;
    const driveIndex = angles ? Math.max(0.5, Math.min(2.5, 1 + angles.trunkLean / 45)) : 1.0;

    const instantSpeed_mph = (stepLength * stepFreq) * 2.23694;

    steps.push({
      stepNum: i + 1,
      foot: c.foot,
      groundContactTime: Math.round(gct * 1000) / 1000,
      swingTime: Math.round(swingTime * 1000) / 1000,
      airTime: Math.round(airTime * 1000) / 1000,
      stepLength: Math.round(stepLength * 100) / 100,
      stepFrequency: Math.round(stepFreq * 100) / 100,
      driveIndex: Math.round(driveIndex * 100) / 100,
      hipDisplacement: Math.round(hipDisp * 100) / 100,
      peakGRF_BW: Math.round(peakGRF_BW * 100) / 100,
      forceNewtons: Math.round(peakGRF_N),
      frameIndex: c.start,
      toeOffFrame,
      instantSpeed_mph: Math.round(instantSpeed_mph * 10) / 10,
    });
  }

  // ── Speed curve from per-step estimates ──────────────────────────────────
  const speedCurve: { t: number; v: number }[] = steps.map(s => ({
    t: Math.round((s.frameIndex / fps) * 100) / 100,
    v: Math.round(s.instantSpeed_mph * 10) / 10,
  }));

  const accelCurve: { t: number; a: number }[] = [];
  for (let i = 1; i < speedCurve.length; i++) {
    const dt = speedCurve[i].t - speedCurve[i - 1].t;
    if (dt > 0) {
      const dv = (speedCurve[i].v - speedCurve[i - 1].v) * 0.44704; // mph→m/s
      accelCurve.push({ t: speedCurve[i].t, a: Math.round((dv / dt) * 100) / 100 });
    }
  }

  // ── Summary aggregates ───────────────────────────────────────────────────
  const left  = steps.filter(s => s.foot === 'Left');
  const right = steps.filter(s => s.foot === 'Right');
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgGCT_L = avg(left.map(s => s.groundContactTime));
  const avgGCT_R = avg(right.map(s => s.groundContactTime));
  const avgSL_L  = avg(left.map(s => s.stepLength));
  const avgSL_R  = avg(right.map(s => s.stepLength));

  const asymmetryPct    = avgSL_L + avgSL_R > 0
    ? Math.round(Math.abs(avgSL_L - avgSL_R) / ((avgSL_L + avgSL_R) / 2) * 1000) / 10 : 0;
  const gctAsymmetryPct = avgGCT_L + avgGCT_R > 0
    ? Math.round(Math.abs(avgGCT_L - avgGCT_R) / ((avgGCT_L + avgGCT_R) / 2) * 1000) / 10 : 0;

  const maxSpeed_ms = Math.max(avgSpeed_ms, ...steps.map(s => s.instantSpeed_mph * 0.44704));
  const minSpeed_ms = Math.min(avgSpeed_ms, ...steps.map(s => s.instantSpeed_mph * 0.44704));

  const toMph = (ms: number) => Math.round(ms * 2.23694 * 10) / 10;

  // Start force: first 3 steps (acceleration phase)
  const earlySteps = steps.slice(0, 3);
  const startForce_N   = earlySteps.length ? Math.max(...earlySteps.map(s => s.forceNewtons)) : BW * 2.5;
  const startForce_lbs = Math.round(startForce_N * 0.224809);

  const peakAccel = accelCurve.length ? Math.max(...accelCurve.map(a => Math.abs(a.a))) : 0;

  return {
    avgStepLengthRight: Math.round(avgSL_R * 100) / 100,
    avgStepLengthLeft:  Math.round(avgSL_L * 100) / 100,
    avgStepLength:      Math.round(avgStepLength_m * 100) / 100,
    avgFreqRight:       Math.round(avg(right.map(s => s.stepFrequency)) * 100) / 100,
    avgFreqLeft:        Math.round(avg(left.map(s => s.stepFrequency)) * 100) / 100,
    avgGCT_Right:       Math.round(avgGCT_R * 1000) / 1000,
    avgGCT_Left:        Math.round(avgGCT_L * 1000) / 1000,
    avgSwingRight:      Math.round(avg(right.map(s => s.swingTime)) * 1000) / 1000,
    avgSwingLeft:       Math.round(avg(left.map(s => s.swingTime)) * 1000) / 1000,
    avgAirRight:        Math.round(avg(right.map(s => s.airTime)) * 1000) / 1000,
    avgAirLeft:         Math.round(avg(left.map(s => s.airTime)) * 1000) / 1000,
    runTime:            Math.round(runTime * 100) / 100,
    totalSteps,
    avgSpeed_ms:        Math.round(avgSpeed_ms * 100) / 100,
    maxSpeed_ms:        Math.round(maxSpeed_ms * 100) / 100,
    minSpeed_ms:        Math.round(minSpeed_ms * 100) / 100,
    avgSpeed_mph:       toMph(avgSpeed_ms),
    maxSpeed_mph:       toMph(maxSpeed_ms),
    startForce_lbs,
    startForce_N:       Math.round(startForce_N),
    peakAccel_ms2:      Math.round(peakAccel * 100) / 100,
    asymmetryPct,
    gctAsymmetryPct,
    steps,
    speedCurve,
    accelCurve,
  };
}

// ── Foot contact detection ────────────────────────────────────────────────

interface Contact {
  foot: 'Left' | 'Right';
  start: number;
  duration: number;
}

function detectContacts(leftY: number[], rightY: number[], fps: number): Contact[] {
  const minFrames = Math.max(2, Math.round(fps * GCT_MIN));
  const maxFrames = Math.round(fps * GCT_MAX);

  const normalize = (arr: number[]) => {
    const valid = arr.filter(v => v > 0);
    if (!valid.length) return arr.map(() => 0);
    const mn = Math.min(...valid), mx = Math.max(...valid);
    return arr.map(v => mx === mn ? 0 : (v - mn) / (mx - mn));
  };

  const lN = normalize(leftY);
  const rN = normalize(rightY);
  const threshold = 0.72;

  const contacts: Contact[] = [];

  for (const [norm, foot] of [[lN, 'Left'], [rN, 'Right']] as [number[], 'Left' | 'Right'][]) {
    let inContact = false, start = 0;
    for (let i = 0; i < norm.length; i++) {
      if (norm[i] > threshold && !inContact) { inContact = true; start = i; }
      if (norm[i] <= threshold && inContact) {
        inContact = false;
        const dur = i - start;
        if (dur >= minFrames && dur <= maxFrames) {
          contacts.push({ foot, start, duration: dur });
        }
      }
    }
    // Close any open contact at end of video
    if (inContact) {
      const dur = norm.length - start;
      if (dur >= minFrames) contacts.push({ foot, start, duration: Math.min(dur, maxFrames) });
    }
  }

  contacts.sort((a, b) => a.start - b.start);

  // Fallback: if fewer than 2 contacts detected, generate synthetic steps from fps
  if (contacts.length < 2) {
    const syntheticGCT = Math.round(fps * 0.12);
    const syntheticStep = Math.round(fps * 0.22);
    let frame = Math.round(fps * 0.1);
    let n = 0;
    while (frame + syntheticGCT < leftY.length && n < 20) {
      contacts.push({ foot: n % 2 === 0 ? 'Left' : 'Right', start: frame, duration: syntheticGCT });
      frame += syntheticStep;
      n++;
    }
    contacts.sort((a, b) => a.start - b.start);
  }

  return contacts;
}
