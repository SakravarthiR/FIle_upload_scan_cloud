/**
 * components/FileRow.jsx
 *
 * A single file entry — styled as an index card in the catalog.
 * Receives `file` and `isNew` (triggers stamp-press animation on status).
 */

import { useState, useEffect } from 'react';
import StatusBadge from './ui/StatusBadge';
import { downloadFile } from '../services/api';

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
  const [animate, setAnimate] = useState(isNew);

  // Trigger re-animation when status changes
  useEffect(() => {
    if (isNew) {
      setAnimate(true);
      const t = setTimeout(() => setAnimate(false), 500);
      return () => clearTimeout(t);
    }
  }, [isNew, file.status]);

  const isClean = file.status === 'CLEAN';
  const url     = isClean ? downloadFile(file.file_id) : null;

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
        {isClean && url ? (
          <a
            href={url}
            download={file.original_filename}
            className="vintage-btn-outline text-xs px-3 py-1 inline-block no-underline"
            title="Download cleared file"
          >
            ↓ Collect
          </a>
        ) : (
          <span className="font-courier text-xs text-sepia/30 italic">
            {file.status === 'PENDING' ? 'Under review…' : '—'}
          </span>
        )}
      </td>
    </tr>
  );
}
