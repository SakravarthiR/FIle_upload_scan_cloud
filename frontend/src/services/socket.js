/**
 * services/socket.js
 *
 * Socket.io client factory.
 * Creates a single authenticated connection and exports it.
 * Call initSocket(token) once after login; call disconnectSocket() on logout.
 */

import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

let _socket = null;

/**
 * Create (or return existing) authenticated socket connection.
 *
 * @param {string} token - JWT token
 * @returns {import('socket.io-client').Socket}
 */
export function initSocket(token) {
  if (_socket?.connected) return _socket;

  _socket = io(WS_URL, {
    auth:       { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay:    2000,
  });

  _socket.on('connect',       () => console.log('[WS] Connected:', _socket.id));
  _socket.on('disconnect',    (r) => console.log('[WS] Disconnected:', r));
  _socket.on('connect_error', (e) => console.error('[WS] Error:', e.message));

  return _socket;
}

/**
 * Get the active socket (null if not initialised).
 */
export function getSocket() {
  return _socket;
}

/**
 * Disconnect and clean up the socket.
 */
export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
