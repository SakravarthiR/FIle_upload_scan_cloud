/**
 * services/api.js
 *
 * Axios instance + all API call functions.
 * Import this — never use axios directly in components.
 *
 * Auth architecture:
 *   - Access token (15 min) stored in memory (React state) — never localStorage
 *   - Refresh token (7 days) stored in HttpOnly cookie — set by server
 *   - On 401, automatically calls /auth/refresh to get a new access token
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// In-memory access token — NOT localStorage (XSS protection)
let _accessToken = null;

export const setAccessToken  = (token) => { _accessToken = token; };
export const getAccessToken  = ()      => _accessToken;
export const clearAccessToken = ()     => { _accessToken = null; };

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL:         BASE_URL,
  timeout:         30_000,
  withCredentials: true,  // IMPORTANT: send the HttpOnly refresh cookie automatically
  headers: { 'Content-Type': 'application/json' },
});

// Inject access token from memory on every request
api.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

// ── 401 → auto-refresh interceptor ────────────────────────────────────────
let _isRefreshing = false;
let _refreshQueue = []; // queued requests while a refresh is in progress

function processQueue(err, token = null) {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (err) reject(err);
    else     resolve(token);
  });
  _refreshQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Never attempt silent refresh on auth routes — let their errors surface
    // directly to the calling component (login failures, OTP errors, etc.)
    const isAuthRoute = original?.url?.startsWith('/auth/');
    if (isAuthRoute) return Promise.reject(err);

    // Only attempt refresh on 401, and only once per request
    if (err.response?.status === 401 && !original._retried) {
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }).catch(() => {
          window.location.href = '/login';
          return Promise.reject(err);
        });
      }

      original._retried = true;
      _isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = data.access_token;
        setAccessToken(newToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAccessToken();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────────

/** Login — returns { access_token, user } */
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

/** Register — returns { message, email } */
export const register = (email, password, displayName) =>
  api.post('/auth/register', {
    email,
    password,
    display_name: displayName || undefined,
  }).then((r) => r.data);

/** Verify OTP — returns { message } */
export const verifyOtp = (email, otp) =>
  api.post('/auth/verify-otp', { email, otp }).then((r) => r.data);

/** Logout — revokes refresh token on server */
export const logout = () =>
  api.post('/auth/logout').then((r) => r.data);

/** Get current user profile */
export const getMe = () =>
  api.get('/auth/me').then((r) => r.data);

/** Try to restore session using the HttpOnly refresh cookie */
export const tryRefreshSession = () =>
  axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true }).then((r) => r.data);

// ── Files ──────────────────────────────────────────────────────────────────
export const fetchFiles = () =>
  api.get('/files').then((r) => r.data.files);

export const fetchFileStatus = (fileId) =>
  api.get(`/status/${fileId}`).then((r) => r.data);

/**
 * Get a signed download URL for a clean file.
 * Returns a URL that is valid for 15 minutes.
 */
export const getSignedDownloadUrl = (fileId) =>
  api.get(`/files/${fileId}/signed-url`).then((r) => r.data.signed_url);

// ── Upload ─────────────────────────────────────────────────────────────────
/**
 * Upload a file with progress tracking.
 *
 * @param {File} file
 * @param {(pct: number) => void} onProgress
 * @returns {Promise<{ file_id, status, original_filename, job_id }>}
 */
export const uploadFile = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);

  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  }).then((r) => r.data);
};

export default api;
