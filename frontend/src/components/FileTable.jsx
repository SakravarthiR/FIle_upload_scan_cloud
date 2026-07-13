/**
 * components/FileTable.jsx
 *
 * Library catalog table — renders the list of files.
 * Handles loading, empty, and error states with vintage styling.
 */

import FileRow from './FileRow';

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[200, 140, 100, 90, 80].map((w, i) => (
        <td key={i} className="px-4 py-4">
          <div className="skeleton h-4 rounded-none" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export default function FileTable({ files, loading, error, updatedIds = new Set() }) {
  return (
    <div className="paper-card overflow-hidden">
      {/* Table header strip */}
      <div className="flex items-center gap-3 px-5 py-2 border-b-2 border-border bg-aged/60">
        <span className="font-typewriter text-xs tracking-widest text-sepia uppercase opacity-70">
          The Registry of Filed Documents
        </span>
        <span className="ml-auto font-courier text-xs text-sepia/40">
          {!loading && !error && `${files?.length ?? 0} record(s)`}
        </span>
      </div>

      {error && (
        <div className="px-5 py-4 border-b border-border bg-brick/5">
          <p className="font-courier text-sm text-brick">
            <strong className="font-typewriter">⚠ Registry Error:</strong> {error}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          {/* Column headers */}
          <thead>
            <tr className="border-b border-border bg-parchment">
              {['Document', 'Filed On', 'Checksum', 'Inspection', 'Collection'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left font-typewriter text-xs text-sepia/60 uppercase tracking-widest font-normal"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && !error && files?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  {/* Empty state */}
                  <div className="space-y-3">
                    <div className="font-typewriter text-5xl text-border opacity-40">
                      ▭ ▭ ▭
                    </div>
                    <p className="font-display italic text-xl text-sepia/50">
                      The shelves are empty.
                    </p>
                    <p className="font-courier text-sm text-sepia/40">
                      No files have been filed yet. Submit a document for inspection.
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {!loading && files?.map((file) => (
              <FileRow
                key={file.file_id}
                file={file}
                isNew={updatedIds.has(file.file_id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer rule */}
      <div className="px-5 py-2 border-t border-border bg-aged/40 flex justify-between items-center">
        <span className="font-courier text-xs text-sepia/30 italic">
          All documents subject to inspection under Bureau Regulation §7
        </span>
        <span className="font-typewriter text-xs text-sepia/20 tracking-widest">◆</span>
      </div>
    </div>
  );
}
