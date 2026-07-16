/**
 * context/AuthContext.jsx
 *
 * Provides { user, token, login, register, logout, isAuthed } to the entire app.
 *
 * Security model:
 *   - Access token lives in memory only (never localStorage) — XSS-safe
 *   - Refresh token lives in an HttpOnly cookie — JS-inaccessible
 *   - On app load, we attempt a silent token refresh so the user stays
 *     logged in across hard refreshes without storing anything sensitive
 *     in browser storage.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  login       as apiLogin,
  register    as apiRegister,
  logout      as apiLogout,
  tryRefreshSession,
  setAccessToken,
  clearAccessToken,
} from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [accessToken, setAccessTokenState] = useState(null);
  const [initialising, setInitialising] = useState(true); // true while we check refresh cookie

  // ── Silent session restore on app load ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // If the HttpOnly refresh cookie exists and is valid, this succeeds
        const data = await tryRefreshSession();
        setAccessToken(data.access_token);
        setAccessTokenState(data.access_token);
        // Fetch user profile — token is now set in memory
        const { default: api } = await import('../services/api');
        const me = await api.get('/auth/me').then(r => r.data);
        setUser(me.user);
        initSocket(data.access_token);
      } catch {
        // No valid refresh cookie — user needs to log in
        clearAccessToken();
      } finally {
        setInitialising(false);
      }
    })();
  }, []); // run once on mount

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    setAccessToken(data.access_token);
    setAccessTokenState(data.access_token);
    setUser(data.user);
    initSocket(data.access_token);
    return data;
  }, []);

  // ── Register ────────────────────────────────────────────────────────────────
  const register = useCallback(async (email, password, displayName) => {
    // Register now only sends the email and returns success, without logging in.
    const data = await apiRegister(email, password, displayName);
    return data;
  }, []);

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await apiLogout(); // revoke refresh token on server
    } catch {
      // continue even if the request fails — clear client state regardless
    }
    clearAccessToken();
    setAccessTokenState(null);
    setUser(null);
    disconnectSocket();
  }, []);

  // Show nothing until we know auth state (prevents flash of unauthenticated content)
  if (initialising) {
    return null;
  }

  return (
    <AuthContext.Provider value={{
      user,
      token:    accessToken,
      login,
      register,
      logout,
      isAuthed: !!accessToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
