/**
 * context/AuthContext.jsx
 *
 * Provides { user, token, login, logout } to the entire app.
 * State is persisted to localStorage so refresh doesn't log out the user.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import { login as apiLogin } from '../services/api';
import { initSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth_user')); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('auth_token'));

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    localStorage.setItem('auth_token', data.token);
    localStorage.setItem('auth_user',  JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    initSocket(data.token);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
    disconnectSocket();
  }, []);

  // Re-init socket on hot reload if already logged in
  if (token && !window.__socketInitDone) {
    window.__socketInitDone = true;
    initSocket(token);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthed: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
