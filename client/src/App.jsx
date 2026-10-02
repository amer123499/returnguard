import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, onPendingChanged } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Intake from './pages/Intake.jsx';
import Queue from './pages/Queue.jsx';
import ReturnDetail from './pages/ReturnDetail.jsx';

export default function App() {
  const location = useLocation();
  const [pending, setPending] = useState(null);

  const refreshPending = useCallback(() => {
    api.listReturns({ status: 'pending_review', limit: 1 })
      .then((r) => setPending(r.total))
      .catch(() => setPending(null));
  }, []);

  // Refresh the "needs review" count whenever staff move between screens,
  // and whenever a return is submitted or decided.
  useEffect(refreshPending, [location.pathname, refreshPending]);
  useEffect(() => onPendingChanged(refreshPending), [refreshPending]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 2 4 7v8c0 7.5 5.1 13.3 12 15 6.9-1.7 12-7.5 12-15V7z" fill="currentColor" />
            <path d="m11 16 3.5 3.5L21 13" stroke="var(--brand-ink)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="brand-name">ReturnGuard</div>
            <div className="brand-sub">Harlow &amp; Co. Returns</div>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/intake">New return</NavLink>
          <NavLink to="/queue">
            Review queue
            {pending > 0 && <span className="nav-count" aria-label={`${pending} waiting`}>{pending}</span>}
          </NavLink>
          <NavLink to="/dashboard">Trends</NavLink>
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/queue" replace />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/returns/:id" element={<ReturnDetail />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
