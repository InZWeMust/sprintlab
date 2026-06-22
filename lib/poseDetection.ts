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

/** Snap first frame, return all detected poses with their center positions */
export async function detectAllPosesInFrame(
  videoEl: HTMLVideoElement
): Promise<{ cx: number; cy: number; pose: Pose }[]> {
  await waitForVideoMeta(videoEl);
  const detector = await loadDetector(true); // multipose for first frame
  await seekVideo(videoEl, 0);

  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d')!.drawImage(videoEl, 0, 0);

  const detected = await detector.estimatePoses(canvas);
  return detected.map((p: any) => ({
    cx: poseCenterX(p),
    cy: poseCenterY(p),
    pose: {
      keypoints: p.keypoints.map((kp: any) => ({ x: kp.x, y: kp.y, score: kp.score, name: kp.name })),
      score: p.score,
    },
  }));
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
