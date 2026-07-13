/**
 * components/UploadZone.jsx
 *
 * Drag-and-drop file upload card styled as a vintage envelope/file folder.
 * Handles drag events, file selection, progress display, and error states.
 */

import { useState, useRef, useCallback } from 'react';
import { uploadFile } from '../services/api';
import { useToast }   from '../context/ToastContext';

const MAX_SIZE_MB = 500;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default function UploadZone({ onUploaded }) {
  const [dragging,  setDragging]  = useState(false);
  const [file,      setFile]      = useState(null);
  const [progress,  setProgress]  = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);
  const inputRef = useRef(null);
  const { addToast } = useToast();

  const clearState = () => {
    setFile(null); setProgress(0); setError(''); setDone(false);
  };

  const handleFiles = useCallback((files) => {
    if (!files?.length) return;
    const f = files[0];
    setError('');
    setDone(false);

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      return;
    }
    setFile(f);
    setProgress(0);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const onSubmit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError('');

    try {
      const result = await uploadFile(file, setProgress);
      setDone(true);
      addToast(
        `"${file.name}" submitted for inspection. File ID: ${result.file_id.slice(0, 8)}…`,
        'success'
      );
      onUploaded?.(result);
      setTimeout(clearState, 2000);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Upload failed.';
      setError(msg);
      addToast(`REJECTED: ${msg}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="paper-card max-w-xl mx-auto">
      {/* Folder tab */}
      <div
        className="flex items-center gap-2 px-5 py-2 border-b border-border bg-mustard/20"
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
      >
        <span className="font-typewriter text-xs tracking-widest text-sepia uppercase opacity-70">
          File Intake — Bureau of Inspection
        </span>
        <span className="ml-auto font-courier text-xs text-sepia/50">Form No. 7-B</span>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Drop zone ─────────────────────────────────────────────── */}
        <div
          onClick={() => !file && inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`relative min-h-[180px] flex flex-col items-center justify-center gap-3 cursor-pointer
            transition-colors duration-200 select-none
            ${dragging
              ? 'bg-mustard/10 border-mustard border-2 border-dashed'
              : 'bg-parchment border-2 border-dashed border-border hover:border-mustard/70'
            }`}
          role="button"
          aria-label="Drop zone"
        >
          {/* Corner brackets */}
          <span className="corner-bracket tl" />
          <span className="corner-bracket tr" />
          <span className="corner-bracket bl" />
          <span className="corner-bracket br" />

          {file ? (
            /* File selected state */
            <div className="text-center space-y-2 px-4">
              <div className="font-typewriter text-3xl text-mustard">📄</div>
              <p className="font-courier font-bold text-sepia text-sm break-all">{file.name}</p>
              <p className="font-courier text-xs text-sepia/60">{formatBytes(file.size)}</p>
              <button
                onClick={(e) => { e.stopPropagation(); clearState(); }}
                className="font-typewriter text-xs text-brick/70 hover:text-brick underline"
              >
                Remove
              </button>
            </div>
          ) : (
            /* Empty state */
            <div className="text-center space-y-3 px-6">
              <div className="font-typewriter text-4xl text-border">✉</div>
              <p className="font-typewriter text-sepia tracking-wide text-sm">
                Drop your file here
              </p>
              <p className="font-courier text-xs text-sepia/50">
                — or click to browse —
              </p>
              <p className="font-courier text-xs text-sepia/40 mt-2">
                Max {MAX_SIZE_MB} MB · PDF, DOC, ZIP, PNG, and more
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* ── Progress bar ──────────────────────────────────────────── */}
        {uploading && (
          <div className="space-y-1">
            <div className="flex justify-between font-courier text-xs text-sepia/60">
              <span>Transmitting…</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
              {/* Tick marks overlay */}
              <div
                className="absolute inset-0 flex pointer-events-none"
                style={{ paddingLeft: 0 }}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 border-r border-black/10 last:border-0"
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Success / done state ───────────────────────────────────── */}
        {done && (
          <div className="text-center font-typewriter text-sage tracking-widest text-sm py-1">
            ✦ FILE RECEIVED — UNDER REVIEW ✦
          </div>
        )}

        {/* ── Error state ────────────────────────────────────────────── */}
        {error && (
          <div className="border-2 border-brick bg-brick/5 p-3 relative">
            <span
              className="font-typewriter text-brick font-bold text-sm uppercase tracking-widest absolute -top-3 left-3 bg-cream px-1"
            >
              ✗ Rejected
            </span>
            <p className="font-courier text-brick text-sm pt-1">{error}</p>
          </div>
        )}

        <hr className="ticket-tear" />

        {/* ── Submit button ──────────────────────────────────────────── */}
        <div className="flex justify-center">
          <button
            onClick={onSubmit}
            disabled={!file || uploading || done}
            className="vintage-btn text-sm"
          >
            {uploading ? '⟳ Transmitting…' : done ? '✦ Submitted' : '✉ Submit for Inspection'}
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center font-courier text-xs text-sepia/40 italic">
          All files are scanned for malicious content before processing.
        </p>
      </div>
    </div>
  );
}
