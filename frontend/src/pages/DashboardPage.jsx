/**
 * pages/DashboardPage.jsx
 *
 * File registry dashboard with real-time WebSocket status updates.
 * Connects to socket.io, listens on "file:status" events,
 * and animates updated rows with the stamp-press effect.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFiles } from '../services/api';
import { getSocket }  from '../services/socket';
import { useToast }   from '../context/ToastContext';
import FileTable      from '../components/FileTable';

const STATUS_TOAST = {
  CLEAN:    (n) => `DISPATCH: "${n}" has been cleared and is ready for collection.`,
  INFECTED: (n, v) => `ALERT: "${n}" has been QUARANTINED — ${v || 'malware detected'}.`,
  ERROR:    (n) => `NOTICE: "${n}" could not be processed. Please re-submit.`,
  UNKNOWN:  (n) => `NOTICE: "${n}" is under manual review.`,
};
const STATUS_TOAST_TYPE = { CLEAN: 'success', INFECTED: 'error', ERROR: 'warning', UNKNOWN: 'warning' };

export default function DashboardPage() {
  const [files,      setFiles]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [updatedIds, setUpdatedIds] = useState(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState(new Set());
  const { addToast } = useToast();
  const pollRef      = useRef(null);

  // ── Load file list ─────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    try {
      const data = await fetchFiles();
      setFiles(data ?? []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reach the registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    // Poll every 30 s as fallback
    pollRef.current = setInterval(loadFiles, 30_000);
    return () => clearInterval(pollRef.current);
  }, [loadFiles]);

  // ── WebSocket: file:status event ───────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = ({ fileId, status }) => {
      // Update the file status in-place
      setFiles((prev) =>
        prev.map((f) => f.file_id === fileId ? { ...f, status } : f)
      );

      // Mark row for animation
      setUpdatedIds((prev) => new Set([...prev, fileId]));
      setTimeout(() => {
        setUpdatedIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
      }, 800);

      // Toast notification
      const file = files.find((f) => f.file_id === fileId);
      const name = file?.original_filename ?? fileId;
      const virus = file?.virus_name;
      const msg   = STATUS_TOAST[status]?.(name, virus) ?? `File ${fileId} → ${status}`;
      addToast(msg, STATUS_TOAST_TYPE[status] ?? 'info');
    };

    socket.on('file:status', handler);
    return () => socket.off('file:status', handler);
  }, [files, addToast]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-typewriter text-xs tracking-widest text-sepia/50 uppercase">
            Central Filing Room
          </p>
          <h2 className="font-display text-3xl italic text-sepia">
            The Registry
          </h2>
        </div>
        <button
          onClick={() => { setLoading(true); loadFiles(); }}
          className="vintage-btn-outline text-xs px-4 py-2 self-start sm:self-auto"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Legend / Filter */}
      <div className="flex flex-wrap gap-4 items-center font-courier text-xs text-sepia/60 pb-1 select-none">
        <span className="font-typewriter text-xs tracking-wider text-sepia/40 uppercase mr-1">Filter:</span>
        {[
          { status: 'PENDING',  color: '#8B7355', bg: '#8B735533' },
          { status: 'CLEAN',    color: '#7C9070', bg: '#7C907033' },
          { status: 'INFECTED', color: '#A6432D', bg: '#A6432D33' },
          { status: 'ERROR',    color: '#8B3A3A', bg: '#8B3A3A33' },
          { status: 'UNKNOWN',  color: '#C8872A', bg: '#C8872A33' },
        ].map(({ status, color, bg }) => {
          const isActive = selectedStatuses.has(status);
          return (
            <button
              key={status}
              onClick={() => {
                setSelectedStatuses((prev) => {
                  const next = new Set(prev);
                  if (next.has(status)) next.delete(status);
                  else next.add(status);
                  return next;
                });
              }}
              className={`flex items-center gap-1.5 transition-colors duration-200 px-2 py-1 -ml-2 rounded hover:bg-black/5 ${
                isActive ? 'text-sepia font-bold' : ''
              }`}
              title={`Toggle ${status} files`}
            >
              <span
                className="inline-block w-3 h-3 border-2 transition-colors duration-200"
                style={{
                  borderColor: color,
                  backgroundColor: isActive ? color : 'transparent',
                }}
              />
              {status}
            </button>
          );
        })}
        {selectedStatuses.size > 0 && (
          <button
            onClick={() => setSelectedStatuses(new Set())}
            className="text-xs font-courier text-sepia/40 hover:text-sepia underline ml-2"
          >
            Clear Filters
          </button>
        )}
      </div>

      <FileTable
        files={files.filter((f) => selectedStatuses.size === 0 || selectedStatuses.has(f.status))}
        loading={loading}
        error={error}
        updatedIds={updatedIds}
      />

      {/* Live indicator */}
      <div className="flex justify-center items-center gap-2 font-courier text-xs text-sepia/40">
        <span
          className="inline-block w-2 h-2 rounded-full bg-sage"
          style={{ boxShadow: '0 0 4px #7C9070', animation: 'pulse 2s infinite' }}
        />
        Real-time status updates active via secure channel
      </div>
    </div>
  );
}
