'use client';
import { useState } from 'react';
import type { RunMetrics } from '../lib/biomechanics';
import { SPORT_PRESETS, SPORT_LABELS, flagMetric, type SportType } from '../lib/athleteProfiles';
import type { FVProfile, WeyandMetrics } from '../lib/forceVelocity';
import type { RunType } from '../lib/runTypes';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, ScatterChart, Scatter,
} from 'recharts';

interface Props {
  metrics: RunMetrics;
  kinogramUrls: string[];
  sport?: SportType;
  weightKg?: number;
  runType?: RunType;
  fvProfile?: FVProfile | null;
  weyandMetrics?: WeyandMetrics | null;
}

const FLAG_COLOR = { good: '#22c55e', low: '#f59e0b', high: '#ef4444' };
const FLAG_LABEL = { good: '✓', low: '▼ Low', high: '▲ High' };

type Tab = 'summary' | 'steps' | 'charts' | 'analysis' | 'kinogram';

export default function ResultsView({ metrics: m, kinogramUrls, sport = 'custom', weightKg = 75, runType, fvProfile, weyandMetrics }: Props) {
  const preset = SPORT_PRESETS[sport];
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <div>
      {/* Top Live HUD */}
      <div style={{
        background: '#0d0d0d', border: '1px solid #f59e0b44', borderRadius: '14px',
        padding: '1rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700, letterSpacing: '0.1em' }}>SPRINT PHYSICS</span>
            <span style={{ fontSize: '0.65rem', color: '#444', marginLeft: '0.5rem' }}>· {SPORT_LABELS[sport]}</span>
          </div>
          <span style={{ fontSize: '0.65rem', color: '#555' }}>{m.runTime}s</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <HudStat
            label="TOP SPEED" value={`${m.maxSpeed_mph}`} unit="MPH" color="#f59e0b"
            flag={flagMetric(m.maxSpeed_mph, preset.expectedTopSpeed_mph)}
          />
          <HudStat
            label="GC TIME" value={`${Math.round(((m.avgGCT_Left + m.avgGCT_Right) / 2) * 1000)}`} unit="ms" color="#3b82f6"
            flag={flagMetric(Math.round(((m.avgGCT_Left + m.avgGCT_Right) / 2) * 1000), preset.expectedGCT_ms)}
          />
          {runType === 'fly' ? (
            <HudStat label="PEAK GRF" value={`${Math.round(Math.max(...m.steps.map(s => s.peakGRF_BW)) * 10) / 10}`} unit="× BW" color="#ef4444" />
          ) : (
            <HudStat label="START FORCE" value={`${m.startForce_lbs}`} unit="LBS" color="#ef4444" />
          )}
        </div>
      </div>

      {/* Secondary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <StatCard label="Avg Speed" value={`${m.avgSpeed_mph} mph`} sub={`${m.avgSpeed_ms} m/s`} />
        <StatCard label="Max Speed" value={`${m.maxSpeed_mph} mph`} sub={`${m.maxSpeed_ms} m/s`} color="#22c55e" />
        {runType !== 'fly' && <StatCard label="Start Force" value={`${m.startForce_lbs} lbs`} sub={`${m.startForce_N} N`} color="#ef4444" />}
        <StatCard label="Peak Accel" value={`${m.peakAccel_ms2} m/s²`} sub="from speed curve" />
        <StatCard label="Avg Step Len" value={`${m.avgStepLength} m`} sub={`R: ${m.avgStepLengthRight}m · L: ${m.avgStepLengthLeft}m`} />
        <StatCard label="Asymmetry" value={`${m.asymmetryPct}%`} sub="step length L vs R"
          color={m.asymmetryPct < 5 ? '#22c55e' : m.asymmetryPct < 10 ? '#f59e0b' : '#ef4444'} />
        <StatCard label="Step Freq R" value={`${m.avgFreqRight} Hz`} sub={`L: ${m.avgFreqLeft} Hz`} />
        <StatCard label="Run Time" value={`${m.runTime}s`} sub={`${m.steps.length} steps`} />
      </div>

      {/* GCT asymmetry bar */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Ground Contact Time
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <GCTBar label="Right" value={m.avgGCT_Right} max={0.25} color="#f59e0b" />
          <GCTBar label="Left" value={m.avgGCT_Left} max={0.25} color="#3b82f6" />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>{Math.round(m.avgGCT_Right * 1000)} ms Right</span>
          <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700 }}>{Math.round(m.avgGCT_Left * 1000)} ms Left</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto' }}>
        {(['summary', 'charts', 'steps', 'analysis', 'kinogram'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? '#f59e0b' : '#141414',
            color: tab === t ? '#000' : '#888',
            border: '1px solid #2a2a2a', borderRadius: '8px',
            padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 700,
            fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0,
            textTransform: 'capitalize',
          }}>
            {t === 'summary' ? '📊 Summary' : t === 'charts' ? '📈 Charts' : t === 'steps' ? '👟 Steps' : t === 'analysis' ? '⚡ F-v Profile' : '🎞 Kinogram'}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {tab === 'summary' && <SummaryTab m={m} />}
      {tab === 'charts' && <ChartsTab m={m} />}
      {tab === 'steps' && <StepsTab m={m} />}
      {tab === 'analysis' && <AnalysisTab fv={fvProfile ?? null} weyand={weyandMetrics ?? null} runType={runType} />}
      {tab === 'kinogram' && <KinogramTab urls={kinogramUrls} steps={m.steps} />}
    </div>
  );
}

function HudStat({ label, value, unit, color = '#f0f0f0', flag }: {
  label: string; value: string; unit: string; color?: string; flag?: 'good' | 'low' | 'high';
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</p>
      <p style={{ margin: 0, fontSize: '0.6rem', color: '#555', marginTop: 2 }}>{unit}</p>
      <p style={{ margin: 0, fontSize: '0.6rem', color: '#444', marginTop: 2, letterSpacing: '0.05em' }}>{label}</p>
      {flag && <span style={{ fontSize: '0.6rem', color: FLAG_COLOR[flag], fontWeight: 700 }}>{FLAG_LABEL[flag]}</span>}
    </div>
  );
}

function StatCard({ label, value, sub, color = '#f0f0f0' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.9rem' }}>
      <p style={{ margin: 0, fontSize: '0.65rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ margin: '0.3rem 0 0', fontSize: '1.2rem', fontWeight: 800, color }}>{value}</p>
      {sub && <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: '#555' }}>{sub}</p>}
    </div>
  );
}

function GCTBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ flex: 1 }}>
      <p style={{ margin: '0 0 4px', fontSize: '0.72rem', color: '#666' }}>{label}</p>
      <div style={{ background: '#1e1e1e', borderRadius: '100px', height: 8 }}>
        <div style={{ background: color, height: '100%', borderRadius: '100px', width: `${pct}%`, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function SummaryTab({ m }: { m: RunMetrics }) {
  const rows = [
    ['Total Steps', `${m.totalSteps}`],
    ['Run Time', `${m.runTime} s`],
    ['─── SPEED ───', ''],
    ['Avg Speed', `${m.avgSpeed_mph} mph  (${m.avgSpeed_ms} m/s)`],
    ['Max Speed', `${m.maxSpeed_mph} mph  (${m.maxSpeed_ms} m/s)`],
    ['Speed Formula', `${m.avgStepLength}m × ${Math.round(m.totalSteps / m.runTime * 100) / 100}Hz = ${m.avgSpeed_mph} mph ✓`],
    ['─── STRIDE ───', ''],
    ['Avg Step Length - Right', `${m.avgStepLengthRight} m`],
    ['Avg Step Length - Left', `${m.avgStepLengthLeft} m`],
    ['Avg Step Length', `${m.avgStepLength} m`],
    ['Step Asymmetry', `${m.asymmetryPct}%`],
    ['─── FREQUENCY ───', ''],
    ['Step Freq - Right', `${m.avgFreqRight} Hz`],
    ['Step Freq - Left', `${m.avgFreqLeft} Hz`],
    ['─── GROUND CONTACT ───', ''],
    ['Avg GCT - Right', `${Math.round(m.avgGCT_Right * 1000)} ms`],
    ['Avg GCT - Left', `${Math.round(m.avgGCT_Left * 1000)} ms`],
    ['GCT Asymmetry', `${m.gctAsymmetryPct}%`],
    ['─── FLIGHT / SWING ───', ''],
    ['Air Time - Right', `${Math.round(m.avgAirRight * 1000)} ms`],
    ['Air Time - Left', `${Math.round(m.avgAirLeft * 1000)} ms`],
    ['Swing Time - Right', `${Math.round(m.avgSwingRight * 1000)} ms`],
    ['Swing Time - Left', `${Math.round(m.avgSwingLeft * 1000)} ms`],
    ['─── FORCE ───', ''],
    ['Start Force', `${m.startForce_lbs} lbs  (${m.startForce_N} N)`],
    ['Peak Acceleration', `${m.peakAccel_ms2} m/s²`],
  ];

  return (
    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '0.75rem 1rem', background: '#1e1e1e', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Metric</span>
        <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>Value</span>
      </div>
      {rows.map(([k, v], i) => {
        const isHeader = k.startsWith('───');
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: isHeader ? '0.4rem 1rem' : '0.65rem 1rem',
            borderBottom: i < rows.length - 1 ? '1px solid #1a1a1a' : 'none',
            background: isHeader ? '#111' : i % 2 === 0 ? '#141414' : '#161616',
          }}>
            <span style={{ fontSize: isHeader ? '0.65rem' : '0.8rem', color: isHeader ? '#444' : '#aaa', letterSpacing: isHeader ? '0.1em' : 0 }}>{k}</span>
            {!isHeader && <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700 }}>{v}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ChartsTab({ m }: { m: RunMetrics }) {
  const stepLengthData = m.steps.map((s, i) => ({ step: i, length: s.stepLength, foot: s.foot }));
  const freqData = m.steps.map((s, i) => ({ step: i, freq: s.stepFrequency }));
  const grfData = m.steps.map((s, i) => ({ step: i, grf: s.peakGRF_BW }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ChartCard title="Instant Speed (m/s)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={m.speedCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="t" tick={{ fill: '#555', fontSize: 10 }} label={{ value: 'Seconds', position: 'insideBottom', fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 12 }} />
            <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Acceleration (m/s²)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={m.accelCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="t" tick={{ fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#2a2a2a" />
            <Line type="monotone" dataKey="a" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Step Length (m)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={stepLengthData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 10 }} label={{ value: 'Step #', position: 'insideBottom', fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 12 }} />
            <Line type="monotone" dataKey="length" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Step Frequency (Hz)">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={freqData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 12 }} />
            <Line type="monotone" dataKey="freq" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Peak GRF (× Body Weight)">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={grfData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
            <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 10 }} />
            <YAxis tick={{ fill: '#555', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 12 }} />
            <ReferenceLine y={2.5} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '2.5 BW', fill: '#f59e0b', fontSize: 10 }} />
            <Bar dataKey="grf" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Speed = Frequency × Length verification */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem' }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Speed Formula Verification
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>v = step_frequency × step_length</p>
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {m.steps.slice(0, 5).map((s, i) => {
            const calc = s.stepFrequency * s.stepLength;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: '#666' }}>Step {i + 1} ({s.foot})</span>
                <span style={{ color: '#f59e0b' }}>{s.stepFrequency} Hz × {s.stepLength}m = <strong>{calc.toFixed(2)} m/s</strong></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem' }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: '#888', fontWeight: 700, textAlign: 'center' }}>{title}</p>
      {children}
    </div>
  );
}

function StepsTab({ m }: { m: RunMetrics }) {
  return (
    <div>
      {/* Gait cycle explainer */}
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.72rem', color: '#555' }}>
        <span style={{ color: '#f59e0b' }}>GCT</span> = touchdown→toe-off &nbsp;·&nbsp;
        <span style={{ color: '#22c55e' }}>Swing</span> = toe-off→next same-foot TD &nbsp;·&nbsp;
        <span style={{ color: '#3b82f6' }}>Air</span> = toe-off→opposite foot TD &nbsp;·&nbsp;
        <span style={{ color: '#888' }}>Elite GCT floor: 75ms</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ background: '#1e1e1e' }}>
              {['#', 'Foot', 'GCT ms', 'Swing ms', 'Air ms', 'Len m', 'Hz', 'mph', 'GRF×BW'].map(h => (
                <th key={h} style={{ padding: '0.6rem 0.5rem', color: '#888', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.steps.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', background: i % 2 === 0 ? '#141414' : '#161616' }}>
                <td style={{ padding: '0.5rem', color: '#555' }}>{s.stepNum}</td>
                <td style={{ padding: '0.5rem', color: s.foot === 'Right' ? '#f59e0b' : '#3b82f6', fontWeight: 700 }}>{s.foot[0]}</td>
                <td style={{ padding: '0.5rem', color: '#f59e0b', fontWeight: 600 }}>{Math.round(s.groundContactTime * 1000)}</td>
                <td style={{ padding: '0.5rem', color: '#22c55e' }}>{Math.round(s.swingTime * 1000)}</td>
                <td style={{ padding: '0.5rem', color: '#3b82f6' }}>{Math.round(s.airTime * 1000)}</td>
                <td style={{ padding: '0.5rem', color: '#f0f0f0' }}>{s.stepLength}</td>
                <td style={{ padding: '0.5rem', color: '#f0f0f0' }}>{s.stepFrequency}</td>
                <td style={{ padding: '0.5rem', color: '#f0f0f0', fontWeight: 600 }}>{s.instantSpeed_mph}</td>
                <td style={{ padding: '0.5rem', color: s.peakGRF_BW > 4 ? '#ef4444' : s.peakGRF_BW > 3 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>{s.peakGRF_BW}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysisTab({ fv, weyand, runType }: { fv: FVProfile | null; weyand: WeyandMetrics | null; runType?: RunType }) {
  const profileColor = fv?.profile === 'force-oriented' ? '#ef4444' : fv?.profile === 'velocity-oriented' ? '#3b82f6' : '#22c55e';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* F-v Profile */}
      {fv ? (
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Force-Velocity Profile <span style={{ color: '#555', fontWeight: 400 }}>(Morin & Samozino 2012)</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', margin: '0.75rem 0' }}>
            <MiniStat label="F0 (max force)" value={`${fv.F0} N/kg`} color="#ef4444" tip="Theoretical max force at zero speed" />
            <MiniStat label="V0 (max velocity)" value={`${fv.V0} m/s`} color="#3b82f6" tip="Theoretical max speed at zero force" />
            <MiniStat label="Pmax" value={`${fv.Pmax} W/kg`} color="#f59e0b" tip="Peak mechanical power output" />
            <MiniStat label="RFmax" value={`${fv.RFmax}%`} color="#a855f7" tip="Peak ratio of horizontal to total force" />
            <MiniStat label="R²" value={`${fv.r2}`} color="#22c55e" tip="Curve fit quality (1.0 = perfect)" />
            <MiniStat label="FV Imbalance" value={`${fv.FVimbalance > 0 ? '+' : ''}${fv.FVimbalance}%`}
              color={Math.abs(fv.FVimbalance) < 25 ? '#22c55e' : '#ef4444'}
              tip="How far from optimal profile" />
          </div>

          {/* Profile badge */}
          <div style={{ background: `${profileColor}18`, border: `1px solid ${profileColor}44`, borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 800, color: profileColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {fv.profile === 'force-oriented' ? '⚡ Force Oriented' : fv.profile === 'velocity-oriented' ? '💨 Velocity Oriented' : '✓ Balanced Profile'}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#888', lineHeight: 1.4 }}>{fv.recommendation}</p>
          </div>

          {/* F-v scatter plot */}
          {fv.points.length > 2 && (
            <>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: '#555' }}>Force vs. Velocity (each point = one step)</p>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis dataKey="velocity" name="Velocity" unit=" m/s" tick={{ fill: '#555', fontSize: 10 }} label={{ value: 'Velocity (m/s)', position: 'insideBottom', fill: '#555', fontSize: 10 }} />
                  <YAxis dataKey="force" name="Force" unit=" N/kg" tick={{ fill: '#555', fontSize: 10 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', color: '#f0f0f0', fontSize: 11 }} />
                  <Scatter data={fv.points} fill="#f59e0b" />
                </ScatterChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      ) : (
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>
            {runType === 'fly' ? 'F-v profile requires a block or standing start run.' : 'Not enough data for F-v profile. Try a longer run or add split times.'}
          </p>
        </div>
      )}

      {/* Weyand Model */}
      {weyand ? (
        <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Top Speed Mechanics <span style={{ color: '#555', fontWeight: 400 }}>(Weyand et al. 2000)</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <MiniStat label="Peak GRF" value={`${weyand.Fmax_BW}× BW`} color="#ef4444" tip="Peak ground reaction force as multiple of body weight" />
            <MiniStat label="Peak GRF" value={`${weyand.Fmax_lbs} lbs`} color="#f97316" tip="Peak ground reaction force in pounds" />
            <MiniStat label="Mech. Effectiveness" value={`${weyand.contactMechEff}%`} color="#a855f7" tip="How effectively force is applied during contact" />
            <MiniStat label="Speed Ceiling" value={`${weyand.topSpeedLimit} mph`} color="#22c55e" tip="Theoretical max speed based on your force output" />
          </div>
          <div style={{
            background: weyand.limitingFactor === 'balanced' ? '#22c55e11' : '#f59e0b11',
            border: `1px solid ${weyand.limitingFactor === 'balanced' ? '#22c55e44' : '#f59e0b44'}`,
            borderRadius: '8px', padding: '0.75rem',
          }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', fontWeight: 700, color: weyand.limitingFactor === 'balanced' ? '#22c55e' : '#f59e0b', textTransform: 'uppercase' }}>
              Limiting Factor: {weyand.limitingFactor === 'contact-time' ? 'Contact Time' : weyand.limitingFactor === 'force' ? 'Force Production' : 'Balanced'}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#888', lineHeight: 1.4 }}>{weyand.insight}</p>
          </div>
        </div>
      ) : null}

      {!fv && !weyand && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#555' }}>
          <p>Run a block or standing start to unlock advanced F-v and biomechanical profiling.</p>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color, tip }: { label: string; value: string; color: string; tip?: string }) {
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #252525', borderRadius: '8px', padding: '0.6rem 0.75rem' }} title={tip}>
      <p style={{ margin: 0, fontSize: '0.6rem', color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 800, color }}>{value}</p>
    </div>
  );
}

function KinogramTab({ urls, steps }: { urls: string[]; steps: RunMetrics['steps'] }) {
  if (!urls.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#555' }}>
        <p>No kinogram frames available.<br />Re-run analysis to generate them.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: '1rem' }}>
        Key frames at foot contact — one per detected step
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.5rem', minWidth: 'max-content' }}>
          {urls.map((url, i) => (
            <div key={i} style={{ textAlign: 'center', flexShrink: 0 }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: '#888' }}>Step {i + 1}</p>
              <img
                src={url}
                alt={`Step ${i + 1}`}
                style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: '6px', border: '1px solid #2a2a2a' }}
              />
              {steps[i] && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: steps[i].foot === 'Right' ? '#f59e0b' : '#3b82f6' }}>
                  {steps[i].foot} · {steps[i].stepLength}m
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Skeleton strip placeholder */}
      <div style={{ marginTop: '1.5rem', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem' }}>
        <p style={{ margin: 0, color: '#555', fontSize: '0.8rem', textAlign: 'center' }}>
          Skeleton overlay renders on each frame above.<br />
          Pose landmarks drawn via canvas during analysis.
        </p>
      </div>
    </div>
  );
}
