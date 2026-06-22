'use client';
import { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { RunMetrics } from '../../lib/biomechanics';
import { SPORT_LABELS, SPORT_PRESETS, lbsToKg, kgToLbs, type SportType } from '../../lib/athleteProfiles';

const ResultsView = dynamic(() => import('../../components/ResultsView'), { ssr: false });

type Step = 'upload' | 'select-athlete' | 'configure' | 'processing' | 'results';

export default function AnalyzePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [sessionName, setSessionName] = useState('');

  // Athlete selection
  const [firstFrame, setFirstFrame] = useState('');
  const [athleteAnchor, setAthleteAnchor] = useState<{ x: number; y: number } | null>(null);
  const [videoNativeW, setVideoNativeW] = useState(1);
  const [videoNativeH, setVideoNativeH] = useState(1);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);

  // Config inputs
  const [sport, setSport] = useState<SportType>('100m');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [weightLbs, setWeightLbs] = useState(165);
  const [weightKg, setWeightKg] = useState(75);
  const [runDistanceM, setRunDistanceM] = useState(20);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(120);
  const [cameraAngle, setCameraAngle] = useState<'side' | 'slight-angle' | 'front-back'>('side');

  // Analysis state
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [kinogramUrls, setKinogramUrls] = useState<string[]>([]);
  const [usedSport, setUsedSport] = useState<SportType>('100m');

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!sessionStorage.getItem('sl_auth')) router.push('/');
  }, [router]);

  const bodyWeightKg = weightUnit === 'lbs' ? lbsToKg(weightLbs) : weightKg;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    setSessionName(f.name.replace(/\.[^.]+$/, ''));
    setAthleteAnchor(null);

    const vid = videoRef.current;
    if (vid) { vid.src = url; vid.load(); }

    setStep('select-athlete');
  };

  // Grab first frame once video meta loads
  useEffect(() => {
    if (step !== 'select-athlete' || !videoUrl) return;
    const vid = videoRef.current;
    if (!vid) return;

    const grab = async () => {
      const { getFirstFrame } = await import('../../lib/poseDetection');
      const dataUrl = await getFirstFrame(vid);
      setFirstFrame(dataUrl);
      setVideoNativeW(vid.videoWidth);
      setVideoNativeH(vid.videoHeight);
    };

    if (vid.readyState >= 1) { grab(); }
    else { vid.addEventListener('loadedmetadata', grab, { once: true }); }
  }, [step, videoUrl]);

  const handleCanvasTap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = frameCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = videoNativeW / rect.width;
    const scaleY = videoNativeH / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setAthleteAnchor({ x, y });

    // Draw crosshair on canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 28, py); ctx.lineTo(px + 28, py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py - 28); ctx.lineTo(px, py + 28); ctx.stroke();
      ctx.fillStyle = '#f59e0b22';
      ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
    };
    img.src = firstFrame;
  }, [firstFrame, videoNativeW, videoNativeH]);

  const startAnalysis = async () => {
    const vid = videoRef.current;
    if (!vid) { alert('Video not ready'); return; }

    setStep('processing');
    setProgress(0);
    setProgressMsg('Loading AI pose model...');
    setUsedSport(sport);

    try {
      const { loadDetector, detectPosesFromVideo, extractKinogramFrames } = await import('../../lib/poseDetection');
      await loadDetector(!!athleteAnchor);

      setProgressMsg(athleteAnchor ? 'Tracking selected athlete...' : 'Detecting poses...');
      const { poses, fps } = await detectPosesFromVideo(
        vid,
        (pct) => {
          setProgress(Math.round(pct * 0.8));
          setProgressMsg(`Processing frames... ${pct}%`);
        },
        30,
        athleteAnchor ?? undefined
      );

      setProgressMsg('Computing biomechanics...');
      const { computeRunMetrics } = await import('../../lib/biomechanics');
      const result = computeRunMetrics(poses, fps, bodyWeightKg, pixelsPerMeter, runDistanceM);
      setMetrics(result);

      setProgressMsg('Generating kinogram...');
      const keyFrames = result.steps.slice(0, 7).map(s => s.frameIndex);
      const kFrames = await extractKinogramFrames(vid, keyFrames, fps);
      setKinogramUrls(kFrames);

      const session = {
        id: Date.now().toString(),
        name: sessionName || 'Session',
        date: new Date().toLocaleDateString(),
        sport,
        avgSpeed_mph: result.avgSpeed_mph,
        maxSpeed_mph: result.maxSpeed_mph,
        steps: result.steps.length,
        asymmetry: result.asymmetryPct,
      };
      const prev = JSON.parse(localStorage.getItem('sl_sessions') ?? '[]');
      localStorage.setItem('sl_sessions', JSON.stringify([session, ...prev].slice(0, 20)));

      setProgress(100);
      setStep('results');
    } catch (err: any) {
      console.error(err);
      setProgressMsg('Error: ' + (err?.message ?? 'Unknown'));
    }
  };

  const navTitle: Record<Step, string> = {
    upload: 'New Analysis',
    'select-athlete': 'Select Athlete',
    configure: 'Configure',
    processing: 'Analyzing...',
    results: sessionName,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      <video ref={videoRef} src={videoUrl} playsInline muted preload="auto" style={{ display: 'none' }} />

      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid #1e1e1e' }}>
        <button
          onClick={() => {
            if (step === 'select-athlete') setStep('upload');
            else if (step === 'configure') setStep('select-athlete');
            else router.push('/dashboard');
          }}
          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
        >←</button>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f0f0f0' }}>{navTitle[step]}</h2>
        {/* Step dots */}
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
          {(['upload', 'select-athlete', 'configure', 'processing'] as Step[]).map((s, i) => (
            <div key={s} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: step === s ? '#f59e0b' : ['upload','select-athlete','configure','processing','results'].indexOf(step) > i ? '#f59e0b44' : '#2a2a2a',
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* ── UPLOAD ── */}
        {step === 'upload' && (
          <label style={{
            display: 'block', border: '2px dashed #2a2a2a', borderRadius: '14px',
            padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', background: '#141414',
          }}>
            <input type="file" accept="video/*,.mov,.mp4" onChange={handleFileSelect} style={{ display: 'none' }} />
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📹</div>
            <p style={{ color: '#f59e0b', fontWeight: 700, margin: '0 0 0.5rem' }}>Tap to upload video</p>
            <p style={{ color: '#555', fontSize: '0.8rem', margin: 0 }}>MP4 or MOV · Side view works best</p>
            <div style={{ marginTop: '1.5rem', background: '#1a1a1a', borderRadius: '10px', padding: '1rem', textAlign: 'left' }}>
              <p style={{ color: '#888', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>FILMING TIPS FOR ACCURACY</p>
              {[
                '📐 Camera perfectly side-on to the athlete',
                '👟 Full body visible, not cropped at edges',
                '🎯 Single athlete or athlete clearly separated from crowd',
                '📏 Fixed camera — no panning or zooming',
                '💡 Good lighting, no motion blur',
              ].map(tip => (
                <p key={tip} style={{ color: '#555', fontSize: '0.75rem', margin: '0.25rem 0' }}>{tip}</p>
              ))}
            </div>
          </label>
        )}

        {/* ── SELECT ATHLETE ── */}
        {step === 'select-athlete' && (
          <div>
            <div style={{
              background: athleteAnchor ? '#22c55e11' : '#f59e0b11',
              border: `1px solid ${athleteAnchor ? '#22c55e44' : '#f59e0b44'}`,
              borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem',
            }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: athleteAnchor ? '#22c55e' : '#f59e0b', fontWeight: 700 }}>
                {athleteAnchor ? '✓ Athlete selected — tap to change' : '👇 Tap on the athlete you want to analyze'}
              </p>
              {!athleteAnchor && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#666' }}>
                  If the video is solo (one person), tap anywhere on the athlete. Multiple people in frame? Tap exactly on your athlete.
                </p>
              )}
            </div>

            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem' }}>
              {firstFrame ? (
                <canvas
                  ref={el => {
                    (frameCanvasRef as any).current = el;
                    if (el && firstFrame && !athleteAnchor) {
                      el.width = videoNativeW;
                      el.height = videoNativeH;
                      const ctx = el.getContext('2d');
                      if (ctx) {
                        const img = new Image();
                        img.onload = () => ctx.drawImage(img, 0, 0, el.width, el.height);
                        img.src = firstFrame;
                      }
                    }
                  }}
                  onClick={handleCanvasTap}
                  style={{
                    width: '100%', height: 'auto', display: 'block', cursor: 'crosshair',
                    borderRadius: '12px',
                  }}
                />
              ) : (
                <div style={{ background: '#141414', borderRadius: '12px', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ color: '#555' }}>Loading first frame...</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setStep('configure')} style={{
                flex: 1, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '10px',
                color: '#888', padding: '0.9rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
              }}>
                Skip (solo video)
              </button>
              <button
                onClick={() => setStep('configure')}
                disabled={!athleteAnchor}
                style={{
                  flex: 2, background: athleteAnchor ? '#f59e0b' : '#2a2a2a',
                  border: 'none', borderRadius: '10px',
                  color: athleteAnchor ? '#000' : '#555',
                  padding: '0.9rem', cursor: athleteAnchor ? 'pointer' : 'not-allowed',
                  fontWeight: 800, fontSize: '0.9rem',
                }}
              >
                Confirm Athlete →
              </button>
            </div>
          </div>
        )}

        {/* ── CONFIGURE ── */}
        {step === 'configure' && (
          <div>
            {videoUrl && (
              <video src={videoUrl} controls playsInline
                style={{ width: '100%', borderRadius: '12px', marginBottom: '1.5rem', background: '#000' }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <Field label="Session Name" value={sessionName} onChange={setSessionName} type="text" />

              {/* Athlete type */}
              <div>
                <label style={labelStyle}>Athlete Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {(Object.keys(SPORT_LABELS) as SportType[]).map(s => (
                    <button key={s} onClick={() => setSport(s)} style={{
                      background: sport === s ? '#f59e0b22' : '#141414',
                      border: `1px solid ${sport === s ? '#f59e0b' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.6rem 0.5rem',
                      color: sport === s ? '#f59e0b' : '#666',
                      fontWeight: sport === s ? 700 : 400, fontSize: '0.78rem',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                      {SPORT_LABELS[s]}
                    </button>
                  ))}
                </div>
                {sport !== 'custom' && (
                  <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.4rem 0 0' }}>
                    Expected: {SPORT_PRESETS[sport].expectedTopSpeed_mph[0]}–{SPORT_PRESETS[sport].expectedTopSpeed_mph[1]} mph · GCT {SPORT_PRESETS[sport].expectedGCT_ms[0]}–{SPORT_PRESETS[sport].expectedGCT_ms[1]} ms
                  </p>
                )}
              </div>

              {/* Camera angle — affects step detection accuracy */}
              <div>
                <label style={labelStyle}>Camera Angle</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {([
                    { val: 'side', label: 'Pure Side', desc: 'Best' },
                    { val: 'slight-angle', label: 'Slight Angle', desc: 'OK' },
                    { val: 'front-back', label: 'Front/Back', desc: 'Limited' },
                  ] as const).map(opt => (
                    <button key={opt.val} onClick={() => setCameraAngle(opt.val)} style={{
                      background: cameraAngle === opt.val ? '#f59e0b22' : '#141414',
                      border: `1px solid ${cameraAngle === opt.val ? '#f59e0b' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.6rem',
                      color: cameraAngle === opt.val ? '#f59e0b' : '#666',
                      fontWeight: cameraAngle === opt.val ? 700 : 400,
                      fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center',
                    }}>
                      {opt.label}<br />
                      <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Body weight */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Body Weight</label>
                  <div style={{ display: 'flex', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '6px', overflow: 'hidden' }}>
                    {(['lbs', 'kg'] as const).map(u => (
                      <button key={u} onClick={() => setWeightUnit(u)} style={{
                        background: weightUnit === u ? '#f59e0b' : 'transparent',
                        color: weightUnit === u ? '#000' : '#666',
                        border: 'none', padding: '0.3rem 0.75rem',
                        fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
                <input type="number"
                  value={weightUnit === 'lbs' ? weightLbs : weightKg}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (weightUnit === 'lbs') { setWeightLbs(v); setWeightKg(Math.round(lbsToKg(v))); }
                    else { setWeightKg(v); setWeightLbs(Math.round(kgToLbs(v))); }
                  }}
                  style={inputStyle}
                />
                <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.3rem 0 0' }}>
                  = {weightUnit === 'lbs' ? `${Math.round(lbsToKg(weightLbs))} kg` : `${Math.round(kgToLbs(weightKg))} lbs`}
                </p>
              </div>

              <Field
                label="Run Distance (m)"
                value={runDistanceM.toString()}
                onChange={v => setRunDistanceM(Number(v))}
                type="number"
                hint="Exact distance filmed — used for stride length & speed calculation"
              />

              <div>
                <label style={labelStyle}>Video Scale (pixels/meter) — for hip displacement only</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {[
                    { label: 'Phone close', val: 150 },
                    { label: 'Phone mid', val: 100 },
                    { label: 'Phone far', val: 60 },
                    { label: 'Track close', val: 140 },
                    { label: 'Track wide', val: 80 },
                    { label: 'Drone', val: 35 },
                  ].map(p => (
                    <button key={p.val} onClick={() => setPixelsPerMeter(p.val)} style={{
                      background: pixelsPerMeter === p.val ? '#f59e0b22' : '#141414',
                      border: `1px solid ${pixelsPerMeter === p.val ? '#f59e0b' : '#2a2a2a'}`,
                      borderRadius: '6px', color: pixelsPerMeter === p.val ? '#f59e0b' : '#555',
                      fontSize: '0.68rem', padding: '0.4rem', cursor: 'pointer',
                    }}>
                      {p.label}<br /><strong>{p.val}</strong>
                    </button>
                  ))}
                </div>
                <input type="number" value={pixelsPerMeter} onChange={e => setPixelsPerMeter(Number(e.target.value))} style={inputStyle} />
                <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.3rem 0 0' }}>
                  Note: speed & force no longer depend on this — only hip height estimate does.
                </p>
              </div>
            </div>

            <button onClick={startAnalysis} style={{
              width: '100%', background: '#f59e0b', color: '#000', fontWeight: 800,
              border: 'none', borderRadius: '12px', padding: '1rem', fontSize: '1rem', cursor: 'pointer',
            }}>
              Analyze Video ⚡
            </button>
          </div>
        )}

        {/* ── PROCESSING ── */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚡</div>
            <p style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{progressMsg}</p>
            <div style={{ background: '#1e1e1e', borderRadius: '100px', height: 6, margin: '1rem 0' }}>
              <div style={{ background: '#f59e0b', height: '100%', borderRadius: '100px', width: `${progress}%`, transition: 'width 0.4s' }} />
            </div>
            <p style={{ color: '#555', fontSize: '0.8rem' }}>{progress}%</p>
            <p style={{ color: '#444', fontSize: '0.75rem', marginTop: '1rem' }}>Keep this tab open. Takes 1–3 min.</p>
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === 'results' && metrics && (
          <Suspense fallback={<div style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading...</div>}>
            <ResultsView metrics={metrics} kinogramUrls={kinogramUrls} sport={usedSport} weightKg={bodyWeightKg} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141414', border: '1px solid #2a2a2a',
  borderRadius: '8px', padding: '0.75rem', color: '#f0f0f0', fontSize: '1rem',
};

function Field({ label, value, onChange, type, hint }: {
  label: string; value: string; onChange: (v: string) => void; type: string; hint?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      {hint && <p style={{ color: '#444', fontSize: '0.72rem', margin: '0.3rem 0 0' }}>{hint}</p>}
    </div>
  );
}
