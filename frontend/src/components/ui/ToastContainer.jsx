/**
 * components/ui/ToastContainer.jsx
 *
 * Renders vintage telegram-style toast notifications.
 * Positioned at top-right, slides in/out.
 */

import { useToast } from '../../context/ToastContext';

const TYPE_STYLES = {
  info:    { bg: '#F4ECD8', border: '#C4A882', prefix: 'TELEGRAM',  icon: '✉' },
  success: { bg: '#EEF3EC', border: '#7C9070', prefix: 'DISPATCH',  icon: '✦' },
  error:   { bg: '#F5EAE7', border: '#A6432D', prefix: 'ALERT',     icon: '✗' },
  warning: { bg: '#FBF3E3', border: '#C9A227', prefix: 'NOTICE',    icon: '!' },
};

function Toast({ toast, onRemove }) {
  const style = TYPE_STYLES[toast.type] ?? TYPE_STYLES.info;

  return (
    <div
      className="animate-telegram-in w-80 border-2 shadow-card relative font-courier"
      style={{ backgroundColor: style.bg, borderColor: style.border }}
    >
      {/* Header strip */}
      <div
        className="px-3 py-1 flex items-center gap-2 border-b-2"
        style={{ borderColor: style.border, backgroundColor: style.border + '30' }}
      >
        <span className="font-typewriter text-xs tracking-widest opacity-80">
          {style.icon} {style.prefix}
        </span>
        <button
          onClick={() => onRemove(toast.id)}
          className="ml-auto text-sepia/50 hover:text-sepia font-courier text-sm leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {/* Message */}
      <p className="px-3 py-2 text-sm text-sepia leading-snug">
        {toast.message}
      </p>

      {/* Decorative corner mark */}
      <span
        className="absolute bottom-1 right-2 font-typewriter text-xs opacity-20"
        style={{ color: style.border }}
      >
        ◆
      </span>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast toast={t} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
}
