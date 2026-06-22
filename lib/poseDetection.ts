'use client';
import type { Pose } from './biomechanics';

let detectorInstance: any = null;
let detectorType: 'single' | 'multi' = 'single';

export async function loadDetector(multi = false) {
  if (detectorInstance && detectorType === (multi ? 'multi' : 'single')) return detectorInstance;
  detectorInstance = null;

  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-webgl');
  await tf.ready();

  const poseDetection = await import('@tensorflow-models/pose-detection');

  if (multi) {
    detectorInstance = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
    );
    detectorType = 'multi';
  } else {
    detectorInstance = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, enableSmoothing: true }
    );
    detectorType = 'single';
  }
  return detectorInstance;
}

async function waitForVideoMeta(videoEl: HTMLVideoElement): Promise<void> {
  if (videoEl.readyState >= 1 && !isNaN(videoEl.duration) && videoEl.duration > 0) return;
  return new Promise((resolve, reject) => {
    const onMeta = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('Video failed to load. Try MP4 format.')); };
    const cleanup = () => {
      videoEl.removeEventListener('loadedmetadata', onMeta);
      videoEl.removeEventListener('error', onErr);
    };
    videoEl.addEventListener('loadedmetadata', onMeta);
    videoEl.addEventListener('error', onErr);
    if (videoEl.networkState === HTMLMediaElement.NETWORK_EMPTY) videoEl.load();
    setTimeout(() => { cleanup(); reject(new Error('Video took too long to load.')); }, 15000);
  });
}

function poseCenterX(pose: any): number {
  const lh = pose.keypoints?.find((k: any) => k.name === 'left_hip');
  const rh = pose.keypoints?.find((k: any) => k.name === 'right_hip');
  if (lh && rh) return (lh.x + rh.x) / 2;
  if (pose.keypoints?.length) return pose.keypoints.reduce((s: number, k: any) => s + k.x, 0) / pose.keypoints.length;
  return 0;
}

function poseCenterY(pose: any): number {
  const lh = pose.keypoints?.find((k: any) => k.name === 'left_hip');
  const rh = pose.keypoints?.find((k: any) => k.name === 'right_hip');
  if (lh && rh) return (lh.y + rh.y) / 2;
  if (pose.keypoints?.length) return pose.keypoints.reduce((s: number, k: any) => s + k.y, 0) / pose.keypoints.length;
  return 0;
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** Snap first frame, detect all people, draw skeletons, return image + pose centers */
export async function getFirstFrameWithSkeletons(
  videoEl: HTMLVideoElement
): Promise<{ dataUrl: string; people: { cx: number; cy: number }[]; nativeW: number; nativeH: number }> {
  await waitForVideoMeta(videoEl);
  await seekVideo(videoEl, 0);

  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(videoEl, 0, 0);

  // Try multipose detection
  let people: { cx: number; cy: number }[] = [];
  try {
    const detector = await loadDetector(true);
    const detected = await detector.estimatePoses(canvas);
    people = detected.map((p: any) => ({ cx: poseCenterX(p), cy: poseCenterY(p) }));

    // Draw all detected skeletons in dim grey
    for (const p of detected) {
      drawSkeletonOnCanvas(canvas, p.keypoints, '#ffffff44', 1.5);
    }
  } catch {
    // Multipose failed — leave blank skeletons
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    people,
    nativeW: videoEl.videoWidth,
    nativeH: videoEl.videoHeight,
  };
}

/** Draw a highlighted skeleton when user selects a person */
export function highlightPersonOnCanvas(
  canvas: HTMLCanvasElement,
  baseImageUrl: string,
  clickX: number,
  clickY: number,
  people: { cx: number; cy: number }[],
  nativeW: number,
  nativeH: number,
  videoEl: HTMLVideoElement
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scaleX = nativeW / canvas.clientWidth;
  const scaleY = nativeH / canvas.clientHeight;
  const nativeClickX = clickX * scaleX;
  const nativeClickY = clickY * scaleY;

  const img = new Image();
  img.onload = async () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    try {
      const detector = await loadDetector(true);
      const offscreen = document.createElement('canvas');
      offscreen.width = nativeW;
      offscreen.height = nativeH;
      offscreen.getContext('2d')!.drawImage(videoEl, 0, 0);
      const detected = await detector.estimatePoses(offscreen);

      let minD = Infinity, closestIdx = 0;
      detected.forEach((p: any, idx: number) => {
        const d = Math.sqrt((poseCenterX(p) - nativeClickX) ** 2 + (poseCenterY(p) - nativeClickY) ** 2);
        if (d < minD) { minD = d; closestIdx = idx; }
      });

      // Draw all others very dim (blurred overlay)
      detected.forEach((p: any, idx: number) => {
        if (idx !== closestIdx) {
          drawSkeletonOnCanvas(canvas, p.keypoints, '#ffffff18', 1, nativeW, nativeH);
        }
      });

      // Draw selected person: thick bright skeleton + bounding box + label
      const sel = detected[closestIdx];
      if (sel) {
        const sx = canvas.width / nativeW;
        const sy = canvas.height / nativeH;

        // Compute bounding box from keypoints
        const validKps = sel.keypoints.filter((k: any) => (k.score ?? 0) > 0.25);
        if (validKps.length > 2) {
          const xs = validKps.map((k: any) => k.x * sx);
          const ys = validKps.map((k: any) => k.y * sy);
          const bx = Math.min(...xs) - 16;
          const by = Math.min(...ys) - 40;
          const bw = Math.max(...xs) - Math.min(...xs) + 32;
          const bh = Math.max(...ys) - Math.min(...ys) + 32;

          // Glow background box
          ctx.save();
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 4]);
          ctx.strokeRect(bx, by + 24, bw, bh);
          ctx.setLineDash([]);
          ctx.restore();

          // "YOUR ATHLETE" label badge
          const labelX = bx + bw / 2;
          const labelY = by + 20;
          ctx.save();
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          const labelW = ctx.measureText('✓ YOUR ATHLETE').width + 20;
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.roundRect(labelX - labelW / 2, labelY - 16, labelW, 22, 6);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.fillText('✓ YOUR ATHLETE', labelX, labelY);
          ctx.restore();
        }

        // Thick gold skeleton on top
        drawSkeletonOnCanvas(canvas, sel.keypoints, '#f59e0b', 4, nativeW, nativeH);

        // White dot joints
        drawSkeletonOnCanvas(canvas, sel.keypoints, '#ffffff', 1.5, nativeW, nativeH);
      }
    } catch { /* ignore */ }
  };
  img.src = baseImageUrl;
}

const CONNECTIONS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

function drawSkeletonOnCanvas(
  canvas: HTMLCanvasElement,
  keypoints: any[],
  color: string,
  lineWidth: number,
  nativeW?: number,
  nativeH?: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sx = nativeW ? canvas.width / nativeW : 1;
  const sy = nativeH ? canvas.height / nativeH : 1;
  const kpMap = new Map(keypoints.map((kp: any) => [kp.name, kp]));

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (const [a, b] of CONNECTIONS) {
    const kpA = kpMap.get(a), kpB = kpMap.get(b);
    if (kpA && kpB && (kpA.score ?? 0) > 0.25 && (kpB.score ?? 0) > 0.25) {
      ctx.beginPath();
      ctx.moveTo(kpA.x * sx, kpA.y * sy);
      ctx.lineTo(kpB.x * sx, kpB.y * sy);
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  for (const kp of keypoints) {
    if ((kp.score ?? 0) > 0.25) {
      ctx.beginPath();
      ctx.arc(kp.x * sx, kp.y * sy, lineWidth + 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export async function detectPosesFromVideo(
  videoEl: HTMLVideoElement,
  onProgress: (pct: number) => void,
  targetFps = 30,
  athleteAnchor?: { x: number; y: number } // pixel coords of selected athlete on first frame
): Promise<{ poses: Pose[]; fps: number; duration: number }> {
  await waitForVideoMeta(videoEl);

  // Use multipose if we have an anchor (crowd video), single if solo
  const useMulti = !!athleteAnchor;
  const detector = await loadDetector(useMulti);

  const poses: Pose[] = [];
  const duration = videoEl.duration;
  const frameInterval = 1 / targetFps;
  const totalFrames = Math.floor(duration * targetFps);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Track last known position — starts at athlete anchor
  let trackX = athleteAnchor?.x ?? -1;
  let trackY = athleteAnchor?.y ?? -1;

  for (let i = 0; i < totalFrames; i++) {
    await seekVideo(videoEl, i * frameInterval);
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0);

    try {
      const detected = await detector.estimatePoses(canvas);

      let chosen = detected[0];

      if (useMulti && detected.length > 1 && trackX >= 0) {
        // Pick pose closest to last known athlete position
        let minD = Infinity;
        for (const p of detected) {
          const cx = poseCenterX(p);
          const cy = poseCenterY(p);
          const d = dist(cx, cy, trackX, trackY);
          if (d < minD) { minD = d; chosen = p; }
        }
      }

      if (chosen) {
        trackX = poseCenterX(chosen);
        trackY = poseCenterY(chosen);
        poses.push({
          keypoints: chosen.keypoints.map((kp: any) => ({
            x: kp.x, y: kp.y, score: kp.score, name: kp.name,
          })),
          score: chosen.score,
        });
      } else {
        poses.push({ keypoints: [] });
      }
    } catch {
      poses.push({ keypoints: [] });
    }

    if (i % 5 === 0) onProgress(Math.round((i / totalFrames) * 100));
  }

  onProgress(100);
  return { poses, fps: targetFps, duration };
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

export async function extractKinogramFrames(
  videoEl: HTMLVideoElement,
  frameIndices: number[],
  fps: number
): Promise<string[]> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const dataUrls: string[] = [];
  for (const fi of frameIndices) {
    await seekVideo(videoEl, fi / fps);
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0);
    dataUrls.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return dataUrls;
}

export function getFirstFrame(videoEl: HTMLVideoElement): Promise<string> {
  return new Promise(async resolve => {
    await seekVideo(videoEl, 0);
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d')!.drawImage(videoEl, 0, 0);
    resolve(canvas.toDataURL('image/jpeg', 0.9));
  });
}
