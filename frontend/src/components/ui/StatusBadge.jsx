/**
 * components/ui/StatusBadge.jsx
 *
 * Vintage rubber-stamp status indicator.
 * Slightly rotated, ink-style color per status.
 * Receives optional `animate` prop to trigger stamp-press animation.
 */

const STATUS_META = {
  CLEAN:    { label: 'CLEAN',    cls: 'clean',    rotate: 'rotate(2deg)',  icon: '✦' },
  INFECTED: { label: 'INFECTED', cls: 'infected', rotate: 'rotate(-2deg)', icon: '✗' },
  PENDING:  { label: 'PENDING',  cls: 'pending',  rotate: 'rotate(1deg)',  icon: '◌' },
  ERROR:    { label: 'ERROR',    cls: 'error',    rotate: 'rotate(-3deg)', icon: '!' },
  UNKNOWN:  { label: 'UNKNOWN',  cls: 'unknown',  rotate: 'rotate(2.5deg)', icon: '?' },
};

export default function StatusBadge({ status, animate = false }) {
  const meta = STATUS_META[status] ?? STATUS_META.UNKNOWN;

  return (
    <span
      className={`status-stamp ${meta.cls} ${animate ? 'animate-stamp-press' : ''}`}
      style={{ transform: meta.rotate, display: 'inline-block' }}
      title={`Status: ${meta.label}`}
    >
      {meta.icon} {meta.label}
    </span>
  );
}
