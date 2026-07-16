/**
 * components/FileRow.jsx
 *
 * A single file entry — styled as an index card in the catalog.
 * Receives `file` and `isNew` (triggers stamp-press animation on status).
 *
 * Download flow (secure signed URLs):
 *   1. User clicks "↓ Collect"
 *   2. We call GET /files/:id/signed-url to get a 15-min HMAC-signed URL
 *   3. We trigger a browser download from that signed URL
 *   This prevents the access token from ever appearing in the browser history.
 */

import { useState, useEffect } from 'react';
import StatusBadge from './ui/StatusBadge';
import { getSignedDownloadUrl } from '../services/api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default function FileRow({ file, isNew = false }) {
  const [animate,      setAnimate]      = useState(isNew);
  const [downloading,  setDownloading]  = useState(false);
  const [dlError,      setDlError]      = useState('');

  // Trigger re-animation when status changes
  useEffect(() => {
    if (isNew) {
      setAnimate(true);
      const t = setTimeout(() => setAnimate(false), 500);
      return () => clearTimeout(t);
    }
  }, [isNew, file.status]);

  const isClean = file.status === 'CLEAN';

  // ── Signed download handler ─────────────────────────────────────────────────
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDlError('');
    try {
      const signedUrl = await getSignedDownloadUrl(file.file_id);
      // Trigger browser download without exposing the access token in the URL
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = file.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      const msg = err.response?.data?.message || 'Download failed. Please try again.';
      setDlError(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <tr
      className="group border-b border-border/50 transition-colors hover:bg-mustard/5"
      style={{ animation: isNew ? 'fade-in 0.4s ease-out' : undefined }}
    >
      {/* Filename */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-border font-courier text-base">📄</span>
          <div>
            <p className="font-courier text-sm text-sepia font-bold leading-tight max-w-[200px] truncate"
               title={file.original_filename}>
              {file.original_filename}
            </p>
            <p className="font-courier text-xs text-sepia/40 mt-0.5 font-mono">
              {file.file_id?.slice(0, 12)}…
            </p>
          </div>
        </div>
      </td>

      {/* Upload date */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className="font-courier text-xs text-sepia/70">
          {formatDate(file.created_at)}
        </span>
      </td>

      {/* Hash */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="font-mono text-xs text-sepia/50 tracking-tight">
          {file.sha256_hash ? `${file.sha256_hash.slice(0, 10)}…` : '—'}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div style={{ display: 'inline-block' }}>
          <StatusBadge status={file.status} animate={animate} />
        </div>
        {file.virus_name && file.status === 'INFECTED' && (
          <p className="font-courier text-xs text-brick/70 mt-1 italic">{file.virus_name}</p>
        )}
      </td>

      {/* Download */}
      <td className="px-4 py-3">
        {isClean ? (
          <div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="vintage-btn-outline text-xs px-3 py-1 inline-block cursor-pointer"
              title="Download cleared file"
            >
              {downloading ? '⟳ Preparing…' : '↓ Collect'}
            </button>
            {dlError && (
              <p className="font-courier text-xs text-brick/70 mt-1">{dlError}</p>
            )}
          </div>
        ) : (
          <span className="font-courier text-xs text-sepia/30 italic">
            {file.status === 'PENDING' ? 'Under review…' : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}
