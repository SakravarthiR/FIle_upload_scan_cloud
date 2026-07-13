/**
 * pages/UploadPage.jsx
 *
 * File intake page — wraps UploadZone in a page layout.
 */

import { useNavigate } from 'react-router-dom';
import UploadZone from '../components/UploadZone';

export default function UploadPage() {
  const navigate = useNavigate();

  const handleUploaded = () => {
    // After 1.5 s navigate to dashboard so user can watch status update live
    setTimeout(() => navigate('/dashboard'), 1600);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
      {/* Page heading */}
      <div className="text-center space-y-2">
        <p className="font-typewriter text-xs tracking-widest text-sepia/50 uppercase">
          Document Submission Office
        </p>
        <h2 className="font-display text-3xl italic text-sepia">
          File an Inspection Request
        </h2>
        <p className="font-courier text-sm text-sepia/60">
          Submit your document for malware analysis. Results are reported within moments.
        </p>
        <div className="flex justify-center gap-3 items-center mt-2">
          <span className="h-px w-16 bg-border" />
          <span className="font-typewriter text-border">✦</span>
          <span className="h-px w-16 bg-border" />
        </div>
      </div>

      <UploadZone onUploaded={handleUploaded} />

      {/* Instructions card */}
      <div className="paper-card p-5 text-sm space-y-3">
        <h3 className="font-typewriter text-xs tracking-widest text-sepia/70 uppercase border-b border-border pb-2">
          Filing Instructions
        </h3>
        <ol className="list-decimal list-inside font-courier text-sepia/70 space-y-1.5 leading-relaxed">
          <li>Select or drag your document into the intake tray above.</li>
          <li>Press <em>"Submit for Inspection"</em> to transmit the file.</li>
          <li>The Bureau will scan your document for malicious content.</li>
          <li>Cleared files may be collected from the Registry.</li>
          <li>Infected documents are destroyed per Bureau Regulation §7.</li>
        </ol>
      </div>
    </div>
  );
}
