'use client';
import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { RunMetrics } from '../../lib/biomechanics';
import { SPORT_LABELS, SPORT_PRESETS, lbsToKg, kgToLbs, type SportType } from '../../lib/athleteProfiles';

const ResultsView = dynamic(() => import('../../components/ResultsView'), { ssr: false });

type Step = 'upload' | 'configure' | 'processing' | 'results';

export default function AnalyzePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [videoUrl, setVideoUrl] = useState('');
  const [sessionName, setSessionName] = useState('');

  // Athlete inputs
  const [sport, setSport] = useState<SportType>('100m');
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [weightLbs, setWeightLbs] = useState(165);
  const [weightKg, setWeightKg] = useState(75);
  const [runDistanceM, setRunDistanceM] = useState(20);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(120);
  const [useAutoScale, setUseAutoScale] = useState(false);

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setVideoUrl(url);
    setSessionName(f.name.replace(/\.[^.]+$/, ''));
    const vid = videoRef.current;
    if (vid) { vid.src = url; vid.load(); }
    setStep('configure');
  };

  const startAnalysis = async () => {
    const vid = videoRef.current;
    if (!vid) { alert('Video not ready — please re-upload'); return; }
    if (!vid.src && videoUrl) { vid.src = videoUrl; vid.load(); }

    setStep('processing');
    setProgress(0);
    setProgressMsg('Loading AI pose model...');
    setUsedSport(sport);

    try {
      const { loadDetector, detectPosesFromVideo, extractKinogramFrames } = await import('../../lib/poseDetection');
      await loadDetector();

      setProgressMsg('Analyzing video frames...');
      const { poses, fps } = await detectPosesFromVideo(vid, (pct) => {
        setProgress(Math.round(pct * 0.8));
        setProgressMsg(`Detecting poses... ${pct}%`);
      });

      setProgressMsg('Computing biomechanics...');
      const { computeRunMetrics } = await import('../../lib/biomechanics');
      const result = computeRunMetrics(poses, fps, bodyWeightKg, pixelsPerMeter, runDistanceM);
      setMetrics(result);

      setProgressMsg('Generating kinogram...');
      const keyFrames = result.steps.slice(0, 7).map(s => s.frameIndex);
      const kFrames = await extractKinogramFrames(vid, keyFrames, fps, 'toe-off');
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
      setProgressMsg('Done!');
      setStep('results');
    } catch (err: any) {
      console.error(err);
      setProgressMsg('Error: ' + (err?.message ?? 'Unknown error'));
    }
  };

  const navTitle = { upload: 'New Analysis', configure: 'Configure', processing: 'Analyzing...', results: sessionName }[step];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Persistent hidden video */}
      <video ref={videoRef} src={videoUrl} playsInline muted preload="auto" style={{ display: 'none' }} />

      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid #1e1e1e' }}>
        <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f0f0f0' }}>{navTitle}</h2>
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* UPLOAD */}
        {step === 'upload' && (
          <label style={{
            display: 'block', border: '2px dashed #2a2a2a', borderRadius: '14px',
            padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', background: '#141414',
          }}>
            <input type="file" accept="video/*,.mov,.mp4" onChange={handleFileSelect} style={{ display: 'none' }} />
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📹</div>
            <p style={{ color: '#f59e0b', fontWeight: 700, margin: '0 0 0.5rem' }}>Tap to upload video</p>
            <p style={{ color: '#555', fontSize: '0.8rem', margin: 0 }}>MP4, MOV · Side-view works best</p>
          </label>
        )}

        {/* CONFIGURE */}
        {step === 'configure' && (
          <div>
            {videoUrl && (
              <video src={videoUrl} controls playsInline
                style={{ width: '100%', borderRadius: '12px', marginBottom: '1.5rem', background: '#000' }} />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>

              <Field label="Session Name" value={sessionName} onChange={setSessionName} type="text" />

              {/* Sport selector */}
              <div>
                <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Athlete Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {(Object.keys(SPORT_LABELS) as SportType[]).map(s => (
                    <button key={s} onClick={() => setSport(s)} style={{
                      background: sport === s ? '#f59e0b22' : '#141414',
                      border: `1px solid ${sport === s ? '#f59e0b' : '#2a2a2a'}`,
                      borderRadius: '8px', padding: '0.6rem 0.5rem',
                      color: sport === s ? '#f59e0b' : '#666',
                      fontWeight: sport === s ? 700 : 400,
                      fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left',
                    }}>
                      {SPORT_LABELS[s]}
                    </button>
                  ))}
                </div>
                {sport !== 'custom' && (
                  <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.4rem 0 0' }}>
                    Expected top speed: {SPORT_PRESETS[sport].expectedTopSpeed_mph[0]}–{SPORT_PRESETS[sport].expectedTopSpeed_mph[1]} mph ·
                    GCT: {SPORT_PRESETS[sport].expectedGCT_ms[0]}–{SPORT_PRESETS[sport].expectedGCT_ms[1]} ms
                  </p>
                )}
              </div>

              {/* Weight with unit toggle */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ color: '#888', fontSize: '0.8rem', fontWeight: 600 }}>Body Weight</label>
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
                {weightUnit === 'lbs' ? (
                  <input type="number" value={weightLbs}
                    onChange={e => { setWeightLbs(Number(e.target.value)); setWeightKg(Math.round(lbsToKg(Number(e.target.value)))); }}
                    style={inputStyle}
                    placeholder="e.g. 165"
                  />
                ) : (
                  <input type="number" value={weightKg}
                    onChange={e => { setWeightKg(Number(e.target.value)); setWeightLbs(Math.round(kgToLbs(Number(e.target.value)))); }}
                    style={inputStyle}
                    placeholder="e.g. 75"
                  />
                )}
                <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.3rem 0 0' }}>
                  = {weightUnit === 'lbs' ? `${Math.round(lbsToKg(weightLbs))} kg` : `${Math.round(kgToLbs(weightKg))} lbs`}
                </p>
              </div>

              <Field
                label="Run Distance (m)"
                value={runDistanceM.toString()}
                onChange={v => setRunDistanceM(Number(v))}
                type="number"
                hint="10m, 20m, 40m, 60m, 100m — whatever you filmed"
              />

              {/* Scale calibration */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ color: '#888', fontSize: '0.8rem', fontWeight: 600 }}>Video Scale (pixels/meter)</label>
                  <button onClick={() => setUseAutoScale(p => !p)} style={{
                    background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '6px',
                    color: '#666', fontSize: '0.7rem', padding: '0.2rem 0.6rem', cursor: 'pointer',
                  }}>
                    {useAutoScale ? 'Manual' : 'Presets'}
                  </button>
                </div>
                {useAutoScale ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {[
                      { label: 'Phone · close', val: 80 },
                      { label: 'Phone · mid', val: 120 },
                      { label: 'Phone · far', val: 60 },
                      { label: 'Track · close', val: 150 },
                      { label: 'Track · wide', val: 90 },
                      { label: 'Drone', val: 40 },
                    ].map(p => (
                      <button key={p.val} onClick={() => { setPixelsPerMeter(p.val); setUseAutoScale(false); }} style={{
                        background: '#141414', border: '1px solid #2a2a2a', borderRadius: '8px',
                        color: '#888', fontSize: '0.7rem', padding: '0.5rem', cursor: 'pointer',
                      }}>
                        {p.label}<br />
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>{p.val} px/m</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="number" value={pixelsPerMeter} onChange={e => setPixelsPerMeter(Number(e.target.value))} style={inputStyle} />
                )}
                <p style={{ color: '#444', fontSize: '0.7rem', margin: '0.4rem 0 0' }}>
                  Tip: standard lane = 1.22m wide. Count pixels across it ÷ 1.22 = your value.
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

        {/* PROCESSING */}
        {step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚡</div>
            <p style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{progressMsg}</p>
            <div style={{ background: '#1e1e1e', borderRadius: '100px', height: 6, margin: '1rem 0' }}>
              <div style={{ background: '#f59e0b', height: '100%', borderRadius: '100px', width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ color: '#555', fontSize: '0.8rem' }}>{progress}% complete</p>
            <p style={{ color: '#444', fontSize: '0.75rem', marginTop: '1rem' }}>Takes 1–3 min. Keep this tab open.</p>
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* RESULTS */}
        {step === 'results' && metrics && (
          <Suspense fallback={<div style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>Loading...</div>}>
            <ResultsView metrics={metrics} kinogramUrls={kinogramUrls} sport={usedSport} weightKg={bodyWeightKg} />
          </Suspense>
        )}

      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141414', border: '1px solid #2a2a2a',
  borderRadius: '8px', padding: '0.75rem', color: '#f0f0f0', fontSize: '1rem',
};

function Field({ label, value, onChange, type, hint }: {
  label: string; value: string; onChange: (v: string) => void; type: string; hint?: string;
}) {
  return (
    <div>
      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginBottom: '0.4rem', fontWeight: 600 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
      {hint && <p style={{ color: '#444', fontSize: '0.72rem', margin: '0.3rem 0 0' }}>{hint}</p>}
    </div>
  );
}
