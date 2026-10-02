import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import { fmtDate, fmtDateTime, fmtMoney, pct } from '../format.js';
import RiskExplanation from '../components/RiskExplanation.jsx';
import RiskBadge, { StatusPill } from '../components/RiskBadge.jsx';

const REVIEWER_KEY = 'returnguard.reviewer';

function loadReviewer() {
  try { return localStorage.getItem(REVIEWER_KEY) || ''; } catch { return ''; }
}
function saveReviewer(name) {
  try { localStorage.setItem(REVIEWER_KEY, name); } catch { /* ignore */ }
}

export default function ReturnDetail() {
  const { id } = useParams();
  const meta = useMeta();
  const [ret, setRet] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api.getReturn(id).then(setRet).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <div className="page"><p className="error">{error}</p><Link to="/queue">Back to queue</Link></div>;
  if (!ret) return <div className="page muted">Loading return…</div>;

  const h = ret.history;
  const rate = h.itemsPurchased ? h.priorReturns / h.itemsPurchased : null;

  return (
    <div className="page">
      <Link to="/queue" className="back">← Review queue</Link>
      <div className="page-head">
        <div>
          <h1>Return #{ret.id} · {ret.product_name}</h1>
          <p className="muted">
            {ret.customer_name} · order <span className="mono">{ret.order_number}</span> · requested {fmtDateTime(ret.requested_at)}
          </p>
        </div>
        <StatusPill status={ret.status} label={meta.statuses[ret.status]} />
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <RiskExplanation
            score={ret.score}
            riskLevel={ret.risk_level}
            summary={ret.summary}
            recommendation={ret.recommendation}
            factors={ret.factors}
            modelVersion={ret.model_version}
          />
        </div>

        <aside className="detail-side">
          {ret.status === 'pending_review'
            ? <DecisionPanel key={ret.id} ret={ret} onDone={load} />
            : <DecisionRecord ret={ret} statusLabel={meta.statuses[ret.status]} />}

          <section className="card">
            <h3 className="section-title">The return</h3>
            <dl className="facts">
              <dt>Item</dt><dd>{ret.product_name}<br /><span className="muted small">{meta.categories[ret.category]?.label} · {ret.sku}</span></dd>
              <dt>Refund</dt><dd>{fmtMoney(ret.refund_amount)}</dd>
              <dt>Reason</dt><dd>{meta.reasons[ret.reason] || ret.reason}</dd>
              {ret.reason_details && <><dt>Customer said</dt><dd>“{ret.reason_details}”</dd></>}
              <dt>Ordered</dt><dd>{fmtDate(ret.order_date)}</dd>
              <dt>Delivered</dt><dd>{fmtDate(ret.delivered_date)}</dd>
              <dt>Days to return</dt><dd>{ret.days_to_return} of {meta.returnWindowDays}</dd>
            </dl>
          </section>

          <section className="card">
            <h3 className="section-title">Customer history <span className="muted small">(before this return)</span></h3>
            <dl className="facts">
              <dt>Customer since</dt><dd>{fmtDate(ret.customer_since)}</dd>
              <dt>Orders</dt><dd>{h.ordersPlaced}</dd>
              <dt>Items bought</dt><dd>{h.itemsPurchased}</dd>
              <dt>Items returned</dt><dd>{h.priorReturns} {rate !== null && <span className="muted">({pct(h.priorReturns, h.itemsPurchased)}; typical {Math.round(meta.baselineReturnRate * 100)}%)</span>}</dd>
              <dt>Last 90 days</dt><dd>{h.returnsLast90Days} return{h.returnsLast90Days === 1 ? '' : 's'}</dd>
            </dl>
            {ret.otherReturns.length > 0 && (
              <>
                <h4 className="subsection-title">Other returns</h4>
                <ul className="mini-list">
                  {ret.otherReturns.map((o) => (
                    <li key={o.id}>
                      <Link to={`/returns/${o.id}`}>
                        <RiskBadge level={o.risk_level} score={o.score} />
                        <span className="grow">{o.product_name}<br /><span className="muted small">{fmtDate(o.requested_at)} · day {o.days_to_return} · {meta.statuses[o.status]}</span></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function DecisionPanel({ ret, onDone }) {
  const navigate = useNavigate();
  const [reviewer, setReviewer] = useState(loadReviewer);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const decide = async (decision) => {
    setError(null);
    setBusy(true);
    try {
      saveReviewer(reviewer.trim());
      await api.decide(ret.id, { decision, reviewer, note });
      await nextOrReload();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  // After deciding, jump straight to the next riskiest return waiting for review.
  const nextOrReload = async () => {
    const { items } = await api.listReturns({ status: 'pending_review', sort: 'risk', limit: 1 });
    if (items[0]) navigate(`/returns/${items[0].id}`);
    else onDone();
  };

  return (
    <section className="card decision">
      <h3 className="section-title">Your decision</h3>
      <label className="field">
        <span>Your name</span>
        <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="e.g. Dana K." maxLength={100} />
      </label>
      <label className="field">
        <span>Note <span className="muted">(required to deny)</span></span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tags removed, signs of wear" maxLength={1000} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="decision-buttons">
        <button className="btn btn-approve" disabled={busy} onClick={() => decide('approve')}>Approve refund</button>
        <button className="btn btn-deny" disabled={busy} onClick={() => decide('deny')}>Deny return</button>
      </div>
      <p className="fineprint">After you decide, the next return in the queue opens automatically.</p>
    </section>
  );
}

function DecisionRecord({ ret, statusLabel }) {
  return (
    <section className="card">
      <h3 className="section-title">Decision</h3>
      <p><strong>{statusLabel}</strong> by {ret.reviewed_by || '—'}</p>
      <p className="muted small">{fmtDateTime(ret.reviewed_at)}</p>
      {ret.review_note && <p>“{ret.review_note}”</p>}
    </section>
  );
}
