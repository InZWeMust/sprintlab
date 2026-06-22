'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PASSCODE = process.env.NEXT_PUBLIC_PASSCODE ?? '1234';

export default function LoginPage() {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const router = useRouter();

  const attempt = (val: string) => {
    if (val === PASSCODE) {
      sessionStorage.setItem('sl_auth', '1');
      router.push('/dashboard');
    } else if (val.length === PASSCODE.length) {
      setShake(true);
      setError(true);
      setInput('');
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  const press = (d: string) => {
    if (d === 'del') { setInput(p => p.slice(0, -1)); return; }
    const next = input + d;
    setInput(next);
    attempt(next);
  };

  const dots = Array.from({ length: PASSCODE.length }, (_, i) => i < input.length);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #111 100%)',
      padding: '2rem',
    }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', margin: 0 }}>SPRINT LAB</h1>
        <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>Biomechanics Analysis</p>
      </div>

      <div style={{
        background: '#141414', border: '1px solid #2a2a2a', borderRadius: '16px',
        padding: '2rem', width: '100%', maxWidth: '320px',
      }}>
        <p style={{ textAlign: 'center', color: '#888', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Enter Passcode</p>

        <div style={{
          display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem',
          animation: shake ? 'shake 0.4s' : undefined,
        }}>
          {dots.map((filled, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: filled ? '#f59e0b' : 'transparent',
              border: `2px solid ${error ? '#ef4444' : '#444'}`,
              transition: 'all 0.15s',
            }} />
          ))}
        </div>

        {error && (
          <p style={{ textAlign: 'center', color: '#ef4444', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Incorrect passcode
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {['1','2','3','4','5','6','7','8','9','','0','del'].map((d, i) => (
            <button
              key={i}
              onClick={() => d && press(d)}
              style={{
                background: d === '' ? 'transparent' : '#1e1e1e',
                border: d === '' ? 'none' : '1px solid #2a2a2a',
                borderRadius: '10px',
                padding: '1rem',
                color: '#f0f0f0',
                fontSize: d === 'del' ? '1rem' : '1.3rem',
                fontWeight: 600,
                cursor: d ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
            >
              {d === 'del' ? '⌫' : d}
            </button>
          ))}
        </div>
      </div>

      <p style={{ color: '#333', fontSize: '0.7rem', marginTop: '2rem' }}>
        Default passcode: 1234 · Change in .env.local
      </p>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
