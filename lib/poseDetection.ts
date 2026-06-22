'use client';
import type { Pose } from './biomechanics';

let detectorInstance: any = null;

export async function loadDetector() {
  if (detectorInstance) return detectorInstance;

  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-webgl');
  await tf.ready();

  const poseDetection = await import('@tensorflow-models/pose-detection');
  detectorInstance = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
      enableSmoothing: true,
    }
  );
  return detectorInstance;
}

async function waitForVideoMeta(videoEl: HTMLVideoElement): Promise<void> {
  if (videoEl.readyState >= 1 && !isNaN(videoEl.duration) && videoEl.duration > 0) return;
  return new Promise((resolve, reject) => {
    const onMeta = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error('Video failed to load. Try a different file format (MP4 works best).')); };
    const cleanup = () => { videoEl.removeEventListener('loadedmetadata', onMeta); videoEl.removeEventListener('error', onErr); };
    videoEl.addEventListener('loadedmetadata', onMeta);
    videoEl.addEventListener('error', onErr);
    // Trigger load if not started
    if (videoEl.networkState === HTMLMediaElement.NETWORK_EMPTY) videoEl.load();
    // Timeout after 15s
    setTimeout(() => { cleanup(); reject(new Error('Video took too long to load metadata.')); }, 15000);
  });
}

export async function detectPosesFromVideo(
  videoEl: HTMLVideoElement,
  onProgress: (pct: number, poses: Pose[]) => void,
  targetFps = 30
): Promise<{ poses: Pose[]; fps: number; duration: number }> {
  await waitForVideoMeta(videoEl);
  const detector = await loadDetector();
  const poses: Pose[] = [];
  const duration = videoEl.duration;
  const frameInterval = 1 / targetFps;
  const totalFrames = Math.floor(duration * targetFps);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i < totalFrames; i++) {
    const t = i * frameInterval;
    await seekVideo(videoEl, t);
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0);

    try {
      const detected = await detector.estimatePoses(canvas);
      const p = detected[0];
      if (p) {
        poses.push({
          keypoints: p.keypoints.map((kp: any) => ({
            x: kp.x,
            y: kp.y,
            score: kp.score,
            name: kp.name,
          })),
          score: p.score,
        });
      } else {
        poses.push({ keypoints: [] });
      }
    } catch {
      poses.push({ keypoints: [] });
    }

    if (i % 5 === 0) onProgress(Math.round((i / totalFrames) * 100), poses);
  }

  onProgress(100, poses);
  return { poses, fps: targetFps, duration };
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise(resolve => {
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

export function extractKinogramFrames(
  videoEl: HTMLVideoElement,
  frameIndices: number[],
  fps: number,
  label: string
): Promise<string[]> {
  return new Promise(async resolve => {
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
    resolve(dataUrls);
  });
}

export function drawPoseOnCanvas(
  canvas: HTMLCanvasElement,
  pose: Pose,
  color = '#f59e0b'
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !pose.keypoints.length) return;

  const connections = [
    ['left_shoulder', 'right_shoulder'],
    ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
    ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
    ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
    ['left_hip', 'right_hip'],
    ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
    ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ];

  const kpMap = new Map(pose.keypoints.map(kp => [kp.name, kp]));

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [a, b] of connections) {
    const kpA = kpMap.get(a);
    const kpB = kpMap.get(b);
    if (kpA && kpB && (kpA.score ?? 0) > 0.3 && (kpB.score ?? 0) > 0.3) {
      ctx.beginPath();
      ctx.moveTo(kpA.x, kpA.y);
      ctx.lineTo(kpB.x, kpB.y);
      ctx.stroke();
    }
  }

  for (const kp of pose.keypoints) {
    if ((kp.score ?? 0) > 0.3) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}
