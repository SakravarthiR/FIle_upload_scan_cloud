/**
 * services/api.js
 *
 * Axios instance + all API call functions.
 * Import this — never use axios directly in components.
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ── Axios instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────────
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

// ── Files ──────────────────────────────────────────────────────────────────
export const fetchFiles = () =>
  api.get('/files').then((r) => r.data.files);

export const fetchFileStatus = (fileId) =>
  api.get(`/status/${fileId}`).then((r) => r.data);

export const downloadFile = (fileId) =>
  `${BASE_URL}/files/${fileId}/download?token=${localStorage.getItem('auth_token')}`;

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
