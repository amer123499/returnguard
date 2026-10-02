const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const moneyShort = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const fmtMoney = (n) => money.format(Number(n) || 0);
export const fmtMoneyShort = (n) => moneyShort.format(Number(n) || 0);

export function fmtDate(value) {
  if (!value) return '—';
  // Plain dates ('YYYY-MM-DD') are calendar days — don't shift them by timezone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function timeAgo(value) {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');
