/**
 * pages/VerifyOtpPage.jsx
 *
 * OTP verification form.
 */

import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { verifyOtp } from '../services/api';
import { useToast } from '../context/ToastContext';

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const initialEmail = location.state?.email || '';
  
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !otp) {
      setError('Both correspondence address and code are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await verifyOtp(email.trim(), otp.trim());
      addToast('Identity verified. You may now present your credentials to sign in.', 'success');
      navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.message || 'Verification failed. Please check your code.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">

      {/* Masthead */}
      <div className="text-center mb-10 space-y-2">
        <p className="font-typewriter text-xs tracking-widest text-sepia/50 uppercase">
          — Identity Verification —
        </p>
        <h1 className="font-display text-4xl md:text-5xl text-sepia leading-tight italic">
          Verification Required
        </h1>
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="flex-1 max-w-[80px] h-px bg-border" />
          <span className="font-typewriter text-border text-lg">❧</span>
          <span className="flex-1 max-w-[80px] h-px bg-border" />
        </div>
      </div>

      {/* Card */}
      <div className="paper-card w-full max-w-sm">

        {/* Form label */}
        <div className="px-6 py-3 border-b border-border bg-aged/60 flex justify-between items-center">
          <span className="font-typewriter text-xs tracking-widest text-sepia/70 uppercase">
            Telegraphic Code
          </span>
          <span className="font-courier text-xs text-sepia/30">
            Form No. 1-C
          </span>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>

          <p className="font-courier text-sm text-sepia/70 leading-relaxed text-center mb-4">
            A 6-digit verification code has been telegraphed to your correspondence address.
          </p>

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
              required
              readOnly={!!initialEmail}
            />
          </div>

          {/* OTP */}
          <div>
            <label
              htmlFor="otp"
              className="block font-typewriter text-xs tracking-widest text-sepia/70 uppercase mb-1"
            >
              Verification Code (6 Digits)
            </label>
            <input
              id="otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="vintage-input font-typewriter text-center text-lg tracking-[0.5em]"
              required
              maxLength={6}
              autoComplete="one-time-code"
            />
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
            disabled={loading}
            className="vintage-btn w-full text-sm"
          >
            {loading ? '⟳ Verifying…' : '✦ Confirm Identity'}
          </button>

          {/* Switch mode link */}
          <p className="text-center font-courier text-xs text-sepia/50">
            <Link to="/login" className="underline hover:text-sepia/80 transition-colors">
              Return to Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
