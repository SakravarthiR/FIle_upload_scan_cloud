/**
 * pages/LoginPage.jsx
 *
 * Vintage library-card-style login form.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { useToast }    from '../context/ToastContext';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const { login }    = useAuth();
  const { addToast } = useToast();
  const navigate     = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Both fields are required.'); return; }
    setLoading(true); setError('');

    try {
      await login(email, password);
      addToast('Welcome to the Bureau. Your credentials have been accepted.', 'success');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">

      {/* Masthead */}
      <div className="text-center mb-10 space-y-2">
        <p className="font-typewriter text-xs tracking-widest text-sepia/50 uppercase">
          — Established 1887 —
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-sepia leading-tight italic">
          The Bureau of<br />File Inspection
        </h1>
        <p className="font-courier text-sm text-sepia/60 italic">
          Malware Detection &amp; Document Registry
        </p>
        {/* Ornamental divider */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="flex-1 max-w-[80px] h-px bg-border" />
          <span className="font-typewriter text-border text-lg">❧</span>
          <span className="flex-1 max-w-[80px] h-px bg-border" />
        </div>
      </div>

      {/* Login card */}
      <div className="paper-card w-full max-w-sm">
        {/* Card header */}
        <div className="px-6 py-3 border-b border-border bg-aged/60 flex justify-between items-center">
          <span className="font-typewriter text-xs tracking-widest text-sepia/70 uppercase">
            Clerk Identification
          </span>
          <span className="font-courier text-xs text-sepia/30">Form No. 1-A</span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Email */}
          <div>
            <label className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1">
              Correspondence Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clerk@bureau.gov"
              className="vintage-input"
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1">
              Secret Passphrase
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="vintage-input"
              autoComplete="current-password"
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div className="border-2 border-brick bg-brick/5 px-3 py-2">
              <p className="font-courier text-brick text-sm">
                <span className="font-typewriter font-bold">✗ Rejected:</span> {error}
              </p>
            </div>
          )}

          <hr className="ticket-tear" />

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="vintage-btn w-full text-sm"
          >
            {loading ? '⟳ Verifying Credentials…' : '✦ Present Credentials'}
          </button>

          <p className="text-center font-courier text-xs text-sepia/40 italic">
            Any credentials accepted in development mode.
          </p>
        </form>
      </div>

      {/* Footer stamp */}
      <p className="mt-8 font-typewriter text-xs text-sepia/30 tracking-widest">
        OFFICIAL USE ONLY · DEPT. OF DIGITAL ARCHIVES
      </p>
    </div>
  );
}
