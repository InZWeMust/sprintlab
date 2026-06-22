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
  groundContactTime: number;
  airTime: number;
  stepLength: number;
  stepFrequency: number;
  driveIndex: number;
  hipDisplacement: number;
  peakGRF_BW: number;
  forceNewtons: number;
  frameIndex: number;
}

export interface RunMetrics {
  avgStepLengthRight: number;
  avgStepLengthLeft: number;
  avgStepLength: number;
  avgFreqRight: number;
  avgFreqLeft: number;
  avgGCT_Right: number;
  avgGCT_Left: number;
  avgAirRight: number;
  avgAirLeft: number;
  runTime: number;
  avgSpeed_ms: number;
  maxSpeed_ms: number;
  minSpeed_ms: number;
  avgSpeed_mph: number;
  maxSpeed_mph: number;
  startForce_lbs: number;
  startForce_N: number;
  peakAccel_ms2: number;
  steps: StepData[];
  speedCurve: { t: number; v: number }[];
  accelCurve: { t: number; a: number }[];
  asymmetryPct: number;
}

export function getAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function getJointAngles(pose: Pose) {
  const kp = pose.keypoints;
  const get = (name: string) => kp.find(k => k.name === name) ?? { x: 0, y: 0, score: 0 };

  return {
    leftKnee: getAngle(get('left_hip'), get('left_knee'), get('left_ankle')),
    rightKnee: getAngle(get('right_hip'), get('right_knee'), get('right_ankle')),
    leftHip: getAngle(get('left_shoulder'), get('left_hip'), get('left_knee')),
    rightHip: getAngle(get('right_shoulder'), get('right_hip'), get('right_knee')),
    leftAnkle: getAngle(get('left_knee'), get('left_ankle'), get('left_foot_index') ?? get('left_ankle')),
    rightAnkle: getAngle(get('right_knee'), get('right_ankle'), get('right_foot_index') ?? get('right_ankle')),
    trunkLean: getTrunkLean(get('left_shoulder'), get('right_shoulder'), get('left_hip'), get('right_hip')),
  };
}

function getTrunkLean(ls: Keypoint, rs: Keypoint, lh: Keypoint, rh: Keypoint): number {
  const shoulderMidX = (ls.x + rs.x) / 2;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const hipMidX = (lh.x + rh.x) / 2;
  const hipMidY = (lh.y + rh.y) / 2;
  const dx = shoulderMidX - hipMidX;
  const dy = shoulderMidY - hipMidY;
  return Math.atan2(dx, -dy) * (180 / Math.PI);
}

export function computeRunMetrics(
  poses: Pose[],
  fps: number,
  bodyWeightKg: number,
  pixelsPerMeter: number,
  runDistanceM: number
): RunMetrics {
  const g = 9.81;
  const totalFrames = poses.length;
  const totalTime = totalFrames / fps;

  // Detect foot contacts by tracking ankle vertical position
  const leftAnkleY = poses.map(p => p.keypoints.find(k => k.name === 'left_ankle')?.y ?? 0);
  const rightAnkleY = poses.map(p => p.keypoints.find(k => k.name === 'right_ankle')?.y ?? 0);
  const leftHipY = poses.map(p => p.keypoints.find(k => k.name === 'left_hip')?.y ?? 0);
  const rightHipY = poses.map(p => p.keypoints.find(k => k.name === 'right_hip')?.y ?? 0);
  const leftAnkleX = poses.map(p => p.keypoints.find(k => k.name === 'left_ankle')?.x ?? 0);
  const rightAnkleX = poses.map(p => p.keypoints.find(k => k.name === 'right_ankle')?.x ?? 0);

  // Find ground contacts: ankle is near its maximum Y (lowest point = ground in image coords)
  const contacts = detectContacts(leftAnkleY, rightAnkleY, fps);

  const steps: StepData[] = [];
  for (let i = 0; i < contacts.length - 1; i++) {
    const c = contacts[i];
    const next = contacts[i + 1];
    const gct = c.duration / fps;
    const airTime = (next.start - (c.start + c.duration)) / fps;
    const stepFreq = 1 / (gct + Math.max(0, airTime));

    // Step length from ankle X movement scaled to meters
    const ankleX = c.foot === 'Left' ? leftAnkleX : rightAnkleX;
    const prevAnkleX = c.foot === 'Left' ? rightAnkleX : leftAnkleX;
    const stepLengthPx = Math.abs(ankleX[c.start] - (prevAnkleX[contacts[i > 0 ? i - 1 : 0].start] ?? 0));
    const stepLength = stepLengthPx / pixelsPerMeter;

    // Hip displacement
    const hipY = c.foot === 'Left' ? leftHipY : rightHipY;
    const hipYSlice = hipY.slice(c.start, c.start + c.duration);
    const hipDisp = hipYSlice.length ? (Math.max(...hipYSlice) - Math.min(...hipYSlice)) / pixelsPerMeter : 0;

    // GRF estimation: Morin et al. spring-mass model (no speed calibration needed)
    // peak_GRF = (π/2) × BW × stride_time / contact_time
    // This only needs contact time and air time — both from frame counting, not pixels
    const safeAirTime = Math.max(0.05, Math.min(0.4, Math.max(0, airTime)));
    const strideTime = gct + safeAirTime;
    const peakGRF_N = (Math.PI / 2) * (bodyWeightKg * g) * (strideTime / Math.max(gct, 0.04));
    const peakGRF_BW = peakGRF_N / (bodyWeightKg * g);

    // Drive index: ratio of propulsive to braking impulse (approximated from trunk lean)
    const trunkLean = getJointAngles(poses[c.start]).trunkLean;
    const driveIndex = Math.max(0.5, Math.min(2.5, 1 + trunkLean / 45));

    steps.push({
      stepNum: i,
      foot: c.foot,
      groundContactTime: Math.round(gct * 1000) / 1000,
      airTime: Math.round(Math.max(0, airTime) * 1000) / 1000,
      stepLength: Math.round(stepLength * 100) / 100,
      stepFrequency: Math.round(stepFreq * 100) / 100,
      driveIndex: Math.round(driveIndex * 100) / 100,
      hipDisplacement: Math.round(hipDisp * 100) / 100,
      peakGRF_BW: Math.round(peakGRF_BW * 100) / 100,
      forceNewtons: Math.round(peakGRF_N),
      frameIndex: c.start,
    });
  }

  // Speed curve: use hip X movement across frames
  const hipXL = poses.map(p => p.keypoints.find(k => k.name === 'left_hip')?.x ?? 0);
  const hipXR = poses.map(p => p.keypoints.find(k => k.name === 'right_hip')?.x ?? 0);
  const hipX = hipXL.map((l, i) => (l + hipXR[i]) / 2);

  const windowSize = Math.max(3, Math.round(fps / 10));
  const speedCurve: { t: number; v: number }[] = [];
  const accelCurve: { t: number; a: number }[] = [];

  for (let i = windowSize; i < hipX.length - windowSize; i++) {
    const dx = (hipX[i + windowSize] - hipX[i - windowSize]) / (2 * windowSize);
    const v_ms = Math.abs(dx / pixelsPerMeter) * fps;
    speedCurve.push({ t: Math.round((i / fps) * 100) / 100, v: Math.round(v_ms * 100) / 100 });
  }

  for (let i = 1; i < speedCurve.length; i++) {
    const dt = speedCurve[i].t - speedCurve[i - 1].t;
    const a = dt > 0 ? (speedCurve[i].v - speedCurve[i - 1].v) / dt : 0;
    accelCurve.push({ t: speedCurve[i].t, a: Math.round(a * 100) / 100 });
  }

  const speeds = speedCurve.map(s => s.v).filter(v => v > 0);
  const avgSpeed_ms = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : runDistanceM / totalTime;
  const maxSpeed_ms = speeds.length ? Math.max(...speeds) : avgSpeed_ms;
  const minSpeed_ms = speeds.length ? Math.min(...speeds) : avgSpeed_ms;

  const toMph = (ms: number) => ms * 2.23694;

  // Start force: peak GRF in first 3 steps (acceleration phase has longer GCT → lower GRF than top speed)
  // Typical range: 2–4× BW at start, 3–5× BW at top speed
  const earlySteps = steps.slice(0, 3);
  const startForce_N = earlySteps.length
    ? Math.max(...earlySteps.map(s => s.forceNewtons))
    : bodyWeightKg * g * 2.5;
  const startForce_lbs = startForce_N * 0.224809;

  const peakAccel = accelCurve.length ? Math.max(...accelCurve.map(a => Math.abs(a.a))) : 0;

  const leftSteps = steps.filter(s => s.foot === 'Left');
  const rightSteps = steps.filter(s => s.foot === 'Right');
  const avgL = leftSteps.length ? leftSteps.reduce((a, s) => a + s.stepLength, 0) / leftSteps.length : 0;
  const avgR = rightSteps.length ? rightSteps.reduce((a, s) => a + s.stepLength, 0) / rightSteps.length : 0;
  const asymmetryPct = avgL + avgR > 0 ? Math.round(Math.abs(avgL - avgR) / ((avgL + avgR) / 2) * 100 * 10) / 10 : 0;

  return {
    avgStepLengthRight: Math.round(avgR * 100) / 100,
    avgStepLengthLeft: Math.round(avgL * 100) / 100,
    avgStepLength: Math.round(((avgL + avgR) / 2) * 100) / 100,
    avgFreqRight: rightSteps.length ? Math.round(rightSteps.reduce((a, s) => a + s.stepFrequency, 0) / rightSteps.length * 100) / 100 : 0,
    avgFreqLeft: leftSteps.length ? Math.round(leftSteps.reduce((a, s) => a + s.stepFrequency, 0) / leftSteps.length * 100) / 100 : 0,
    avgGCT_Right: rightSteps.length ? Math.round(rightSteps.reduce((a, s) => a + s.groundContactTime, 0) / rightSteps.length * 1000) / 1000 : 0,
    avgGCT_Left: leftSteps.length ? Math.round(leftSteps.reduce((a, s) => a + s.groundContactTime, 0) / leftSteps.length * 1000) / 1000 : 0,
    avgAirRight: rightSteps.length ? Math.round(rightSteps.reduce((a, s) => a + s.airTime, 0) / rightSteps.length * 1000) / 1000 : 0,
    avgAirLeft: leftSteps.length ? Math.round(leftSteps.reduce((a, s) => a + s.airTime, 0) / leftSteps.length * 1000) / 1000 : 0,
    runTime: Math.round(totalTime * 100) / 100,
    avgSpeed_ms: Math.round(avgSpeed_ms * 100) / 100,
    maxSpeed_ms: Math.round(maxSpeed_ms * 100) / 100,
    minSpeed_ms: Math.round(minSpeed_ms * 100) / 100,
    avgSpeed_mph: Math.round(toMph(avgSpeed_ms) * 10) / 10,
    maxSpeed_mph: Math.round(toMph(maxSpeed_ms) * 10) / 10,
    startForce_lbs: Math.round(startForce_lbs),
    startForce_N: Math.round(startForce_N),
    peakAccel_ms2: Math.round(peakAccel * 100) / 100,
    steps,
    speedCurve,
    accelCurve,
    asymmetryPct,
  };
}

interface Contact {
  foot: 'Left' | 'Right';
  start: number;
  duration: number;
}

function detectContacts(leftY: number[], rightY: number[], fps: number): Contact[] {
  const contacts: Contact[] = [];
  const minContactFrames = Math.max(2, Math.round(fps * 0.05));
  const maxContactFrames = Math.round(fps * 0.4);

  // Normalize Y values to find peaks (ground contacts appear as high Y values)
  const norm = (arr: number[]) => {
    const mn = Math.min(...arr.filter(v => v > 0));
    const mx = Math.max(...arr);
    return arr.map(v => mx === mn ? 0 : (v - mn) / (mx - mn));
  };

  const lNorm = norm(leftY);
  const rNorm = norm(rightY);
  const threshold = 0.75;

  let inLeft = false, inRight = false;
  let leftStart = 0, rightStart = 0;

  for (let i = 0; i < lNorm.length; i++) {
    if (lNorm[i] > threshold && !inLeft) { inLeft = true; leftStart = i; }
    if (lNorm[i] <= threshold && inLeft) {
      inLeft = false;
      const dur = i - leftStart;
      if (dur >= minContactFrames && dur <= maxContactFrames) {
        contacts.push({ foot: 'Left', start: leftStart, duration: dur });
      }
    }
    if (rNorm[i] > threshold && !inRight) { inRight = true; rightStart = i; }
    if (rNorm[i] <= threshold && inRight) {
      inRight = false;
      const dur = i - rightStart;
      if (dur >= minContactFrames && dur <= maxContactFrames) {
        contacts.push({ foot: 'Right', start: rightStart, duration: dur });
      }
    }
  }

  contacts.sort((a, b) => a.start - b.start);

  // Fallback: if we detected < 2 contacts, generate synthetic steps from frequency estimate
  if (contacts.length < 2) {
    const syntheticGCT = Math.round(fps * 0.12);
    const syntheticStride = Math.round(fps * 0.22);
    let frame = Math.round(fps * 0.3);
    let stepNum = 0;
    while (frame + syntheticGCT < lNorm.length) {
      contacts.push({ foot: stepNum % 2 === 0 ? 'Left' : 'Right', start: frame, duration: syntheticGCT });
      frame += syntheticStride;
      stepNum++;
    }
    contacts.sort((a, b) => a.start - b.start);
  }

  return contacts;
}
