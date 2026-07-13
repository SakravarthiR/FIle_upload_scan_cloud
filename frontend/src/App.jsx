/**
 * App.jsx
 *
 * Root component — sets up routing, auth guard, and persistent layout.
 */

import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider }         from './context/ToastContext';
import ToastContainer            from './components/ui/ToastContainer';
import LoginPage                 from './pages/LoginPage';
import UploadPage                from './pages/UploadPage';
import DashboardPage             from './pages/DashboardPage';

// ── Auth guard ─────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <Navigate to="/login" replace />;
}

// ── Top nav ────────────────────────────────────────────────────────────────
function NavBar() {
  const { user, logout, isAuthed } = useAuth();
  const navigate = useNavigate();

  if (!isAuthed) return null;

  const linkClass = ({ isActive }) =>
    `font-typewriter text-xs tracking-widest uppercase transition-colors px-1 py-0.5 border-b-2
    ${isActive ? 'border-mustard text-sepia' : 'border-transparent text-sepia/60 hover:text-sepia hover:border-border'}`;

  return (
    <header className="border-b-2 border-border bg-cream/90 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-6">
        {/* Wordmark */}
        <span className="font-display italic text-sepia text-lg leading-none">
          Bureau <span className="font-typewriter text-xs text-sepia/40 not-italic tracking-widest ml-1">of File Inspection</span>
        </span>

        {/* Nav links */}
        <nav className="flex items-center gap-5 ml-4">
          <NavLink to="/"          className={linkClass}>↑ Submit</NavLink>
          <NavLink to="/dashboard" className={linkClass}>▭ Registry</NavLink>
        </nav>

        {/* User + logout */}
        <div className="ml-auto flex items-center gap-3">
          <span className="font-courier text-xs text-sepia/50 hidden sm:inline">
            Clerk: {user?.email?.split('@')[0]}
          </span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="font-typewriter text-xs tracking-widest text-sepia/50 hover:text-brick uppercase border border-border px-2 py-1 hover:border-brick transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Decorative tape strip */}
      <div
        className="h-0.5 w-full"
        style={{
          background: 'repeating-linear-gradient(90deg, #C9A227 0px, #C9A227 12px, transparent 12px, transparent 18px)',
          opacity: 0.4,
        }}
      />
    </header>
  );
}

// ── App root ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <div className="min-h-screen">
            <NavBar />
            <main>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={
                  <RequireAuth><UploadPage /></RequireAuth>
                } />
                <Route path="/dashboard" element={
                  <RequireAuth><DashboardPage /></RequireAuth>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <ToastContainer />
          </div>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
