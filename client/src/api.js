const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}). Is the ReturnGuard server running?`);
  }
  return data;
}

// Fired after anything that can change how many returns wait for review.
const PENDING_CHANGED = 'returnguard:pending-changed';
const notifyPendingChanged = (data) => {
  window.dispatchEvent(new Event(PENDING_CHANGED));
  return data;
};
export function onPendingChanged(fn) {
  window.addEventListener(PENDING_CHANGED, fn);
  return () => window.removeEventListener(PENDING_CHANGED, fn);
}

export const api = {
  meta: () => request('/meta'),
  searchOrders: (q) => request(`/orders/search?q=${encodeURIComponent(q)}`),
  recentOrders: () => request('/orders/recent'),
  getOrder: (orderNumber) => request(`/orders/${encodeURIComponent(orderNumber)}`),
  submitReturn: (body) => request('/returns', { method: 'POST', body }).then(notifyPendingChanged),
  listReturns: (params) => request(`/returns?${new URLSearchParams(params)}`),
  getReturn: (id) => request(`/returns/${id}`),
  decide: (id, body) => request(`/returns/${id}/decision`, { method: 'POST', body }).then(notifyPendingChanged),
  dashboard: (weeks) => request(`/dashboard?weeks=${weeks}`),
};
