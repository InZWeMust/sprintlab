'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Session {
  id: string;
  name: string;
  date: string;
  avgSpeed_mph: number;
  maxSpeed_mph: number;
  steps: number;
  asymmetry: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('sl_auth')) {
      router.push('/');
    }
    const saved = localStorage.getItem('sl_sessions');
    if (saved) setSessions(JSON.parse(saved));
  }, [router]);

  const logout = () => {
    sessionStorage.removeItem('sl_auth');
    router.push('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>⚡ SPRINT LAB</h1>
          <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>Biomechanics Analysis</p>
        </div>
        <button onClick={logout} style={{
          background: 'transparent', border: '1px solid #2a2a2a', borderRadius: '8px',
          color: '#888', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem',
        }}>
          Lock
        </button>
      </div>

      {/* New Analysis CTA */}
      <Link href="/analyze" style={{ textDecoration: 'none' }}>
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b20, #f59e0b10)',
          border: '2px dashed #f59e0b55',
          borderRadius: '14px', padding: '2rem', textAlign: 'center', marginBottom: '2rem',
          cursor: 'pointer', transition: 'border-color 0.2s',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📹</div>
          <p style={{ margin: 0, color: '#f59e0b', fontWeight: 700, fontSize: '1rem' }}>New Analysis</p>
          <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.8rem' }}>Upload a sprint video to analyze</p>
        </div>
      </Link>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {[
          { label: 'Sessions', value: sessions.length.toString() },
          { label: 'Best Speed', value: sessions.length ? `${Math.max(...sessions.map(s => s.maxSpeed_mph)).toFixed(1)} mph` : '—' },
          { label: 'Avg Asym', value: sessions.length ? `${(sessions.reduce((a,s)=>a+s.asymmetry,0)/sessions.length).toFixed(1)}%` : '—' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#141414', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '0.9rem', textAlign: 'center',
          }}>
            <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>{stat.value}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#666', marginTop: '0.2rem' }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Sessions List */}
      <h2 style={{ color: '#888', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
        Recent Sessions
      </h2>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#444' }}>
          <p style={{ fontSize: '2rem' }}>🏃</p>
          <p style={{ fontSize: '0.9rem' }}>No sessions yet — upload a video to start</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sessions.map(s => (
            <Link key={s.id} href={`/analyze?session=${s.id}`} style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#f0f0f0' }}>{s.name}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#555' }}>{s.date}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b' }}>{s.maxSpeed_mph.toFixed(1)} mph</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#555' }}>{s.steps} steps · {s.asymmetry}% asym</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
