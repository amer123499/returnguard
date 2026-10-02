import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const MetaContext = createContext(null);

/** Loads labels (categories, reasons, statuses) from the API once. */
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="boot-message">
        <h1>ReturnGuard can't reach its server</h1>
        <p>{error}</p>
        <p className="muted">Start the API with <code>npm run dev</code> and reload this page.</p>
      </div>
    );
  }
  if (!meta) return <div className="boot-message muted">Loading ReturnGuard…</div>;
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
