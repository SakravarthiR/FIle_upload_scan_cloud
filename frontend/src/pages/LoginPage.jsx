/**
 * pages/LoginPage.jsx
 *
 * Vintage Bureau style — Login + Register in one page with tab toggle.
 * All client-side validation mirrors server-side rules.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import { useToast }    from '../context/ToastContext';

// ── Password strength indicator ───────────────────────────────────────────────
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8)            score++;
  if (/[A-Z]/.test(password))          score++;
  if (/[a-z]/.test(password))          score++;
  if (/[0-9]/.test(password))          score++;
  if (/[^A-Za-z0-9]/.test(password))  score++;

  if (score <= 2) return { score, label: 'Weak',   color: 'bg-red-500' };
  if (score === 3) return { score, label: 'Fair',   color: 'bg-yellow-500' };
  if (score === 4) return { score, label: 'Good',   color: 'bg-blue-500' };
  return               { score, label: 'Strong', color: 'bg-green-600' };
}

export default function LoginPage() {
  const [mode,        setMode]        = useState('login'); // 'login' | 'register'
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const { login, register } = useAuth();
  const { addToast }        = useToast();
  const navigate            = useNavigate();

  const isRegister = mode === 'register';
  const strength   = isRegister ? getPasswordStrength(password) : null;

  // ── Client-side validation ─────────────────────────────────────────────────
  function validate() {
    if (!email.trim())    return 'Correspondence address is required.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Please provide a valid email address.';
    if (!password)        return 'Secret passphrase is required.';

    if (isRegister) {
      if (password.length < 8)             return 'Passphrase must be at least 8 characters.';
      if (!/[A-Z]/.test(password))         return 'Passphrase must contain an uppercase letter.';
      if (!/[a-z]/.test(password))         return 'Passphrase must contain a lowercase letter.';
      if (!/[0-9]/.test(password))         return 'Passphrase must contain a number.';
      if (!/[^A-Za-z0-9]/.test(password))  return 'Passphrase must contain a special character (e.g. !@#$%).';
    }
    return null;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        await register(email.trim(), password, displayName.trim() || undefined);
        addToast('Credentials accepted. Check your email for a verification code.', 'success');
        navigate('/verify-otp', { state: { email: email.trim() } });
      } else {
        await login(email.trim(), password);
        addToast('Welcome back. Your credentials have been accepted.', 'success');
        navigate('/');
      }
    } catch (err) {
      const errorType = err.response?.data?.error;
      const msg = err.response?.data?.message || 'Authentication failed. Please try again.';
      setError(msg);

      if (errorType === 'EmailNotVerified') {
        // Option to redirect to verify page if they tried to log in without verifying
        setTimeout(() => {
          navigate('/verify-otp', { state: { email: email.trim() } });
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Tab switch ─────────────────────────────────────────────────────────────
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setPassword('');
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
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="flex-1 max-w-[80px] h-px bg-border" />
          <span className="font-typewriter text-border text-lg">❧</span>
          <span className="flex-1 max-w-[80px] h-px bg-border" />
        </div>
      </div>

      {/* Card */}
      <div className="paper-card w-full max-w-sm">

        {/* Tab header */}
        <div className="flex border-b border-border">
          <button
            type="button"
            id="tab-login"
            onClick={() => switchMode('login')}
            className={`flex-1 py-3 font-typewriter text-xs tracking-widest uppercase transition-colors ${
              !isRegister
                ? 'bg-aged/80 text-sepia border-r border-border'
                : 'bg-aged/30 text-sepia/40 border-r border-border hover:text-sepia/70'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            id="tab-register"
            onClick={() => switchMode('register')}
            className={`flex-1 py-3 font-typewriter text-xs tracking-widest uppercase transition-colors ${
              isRegister
                ? 'bg-aged/80 text-sepia'
                : 'bg-aged/30 text-sepia/40 hover:text-sepia/70'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form label */}
        <div className="px-6 py-2 border-b border-border bg-aged/40 flex justify-between items-center">
          <span className="font-typewriter text-xs tracking-widest text-sepia/70 uppercase">
            {isRegister ? 'New Clerk Enrolment' : 'Clerk Identification'}
          </span>
          <span className="font-courier text-xs text-sepia/30">
            Form No. {isRegister ? '1-B' : '1-A'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>

          {/* Display name (register only) */}
          {isRegister && (
            <div>
              <label
                htmlFor="display-name"
                className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1"
              >
                Full Name <span className="text-sepia/30 normal-case">(optional)</span>
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Smith"
                className="vintage-input"
                autoComplete="name"
                maxLength={80}
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1"
            >
              Correspondence Address
            </label>
            <input
              id="email"
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
            <label
              htmlFor="password"
              className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1"
            >
              Secret Passphrase
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="vintage-input pr-10"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="button"
                id="toggle-password"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sepia/40 hover:text-sepia/80 text-xs font-typewriter"
                aria-label="Toggle password visibility"
              >
                {showPass ? 'HIDE' : 'SHOW'}
              </button>
            </div>

            {/* Password strength bar (register only) */}
            {isRegister && password && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                        i <= strength.score ? strength.color : 'bg-border'
                      }`}
                    />
                  ))}
                </div>
                <p className="font-typewriter text-[10px] text-sepia/50 tracking-wider">
                  Passphrase strength: {strength.label}
                </p>
              </div>
            )}

            {/* Requirements hint (register only) */}
            {isRegister && (
              <ul className="mt-2 space-y-0.5">
                {[
                  { test: password.length >= 8,            text: 'At least 8 characters' },
                  { test: /[A-Z]/.test(password),          text: 'One uppercase letter' },
                  { test: /[a-z]/.test(password),          text: 'One lowercase letter' },
                  { test: /[0-9]/.test(password),          text: 'One number' },
                  { test: /[^A-Za-z0-9]/.test(password),  text: 'One special character (!@#$%)' },
                ].map(({ test, text }) => (
                  <li
                    key={text}
                    className={`font-courier text-[10px] flex items-center gap-1 transition-colors ${
                      test ? 'text-green-700' : 'text-sepia/40'
                    }`}
                  >
                    <span>{test ? '✓' : '○'}</span> {text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="border-2 border-brick bg-brick/5 px-3 py-2">
              <p className="font-courier text-brick text-sm">
                <span className="font-typewriter font-bold">Rejected:</span> {error}
              </p>
            </div>
          )}

          <hr className="ticket-tear" />

          {/* Submit */}
          <button
            type="submit"
            id={isRegister ? 'btn-register' : 'btn-login'}
            disabled={loading}
            className="vintage-btn w-full text-sm"
          >
            {loading
              ? '⟳ Processing…'
              : isRegister
                ? '✦ Enrol as Clerk'
                : '✦ Present Credentials'}
          </button>

          {/* Switch mode link */}
          <p className="text-center font-courier text-xs text-sepia/50">
            {isRegister ? 'Already enrolled?' : 'Not yet registered?'}{' '}
            <button
              type="button"
              id={isRegister ? 'link-to-login' : 'link-to-register'}
              onClick={() => switchMode(isRegister ? 'login' : 'register')}
              className="underline hover:text-sepia/80 transition-colors"
            >
              {isRegister ? 'Sign in here' : 'Create an account'}
            </button>
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
