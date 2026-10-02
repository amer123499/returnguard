import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import { fmtDate, fmtMoney } from '../format.js';
import RiskExplanation from '../components/RiskExplanation.jsx';
import { StatusPill } from '../components/RiskBadge.jsx';

/** Step 1: find the order. Step 2: pick item + reason. Step 3: see the risk result. */
export default function Intake() {
  const [order, setOrder] = useState(null);
  const [result, setResult] = useState(null);

  const reset = () => { setOrder(null); setResult(null); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>New return request</h1>
          <p className="muted">Look up the order, choose the item and reason. ReturnGuard scores the return as soon as you submit it.</p>
        </div>
        {(order || result) && <button className="btn" onClick={reset}>Start another return</button>}
      </div>

      {!order && <OrderFinder onFound={setOrder} />}
      {order && !result && <ReturnForm order={order} onBack={reset} onSubmitted={setResult} />}
      {result && <ReturnResult order={order} result={result} />}
    </div>
  );
}

function OrderFinder({ onFound }) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.recentOrders().then(setRecent).catch(() => {});
  }, []);

  const open = async (orderNumber) => {
    setError(null);
    setBusy(true);
    try {
      onFound(await api.getOrder(orderNumber));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const search = async (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setError(null);
    setBusy(true);
    try {
      const found = await api.searchOrders(term);
      if (found.length === 1) return onFound(await api.getOrder(found[0].order_number));
      setMatches(found);
      if (!found.length) setError(`No orders match "${term}". Check the order number or try the customer's email.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <form className="search-row" onSubmit={search}>
        <label className="field grow">
          <span>Order number, customer email or name</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. HC-100245 or ava.bennett@example.com"
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>Find order</button>
      </form>
      {error && <p className="error">{error}</p>}

      {matches?.length > 1 && (
        <OrderList title={`${matches.length} matching orders`} orders={matches} onPick={open} />
      )}
      {!matches && recent.length > 0 && (
        <OrderList title="Recently delivered orders" orders={recent} onPick={open} />
      )}
    </section>
  );
}

function OrderList({ title, orders, onPick }) {
  return (
    <>
      <h3 className="section-title">{title}</h3>
      <ul className="order-list">
        {orders.map((o) => (
          <li key={o.id}>
            <button className="order-row" onClick={() => onPick(o.order_number)}>
              <span className="mono strong">{o.order_number}</span>
              <span>{o.customer_name}</span>
              <span className="muted">{o.item_count} item{o.item_count === 1 ? '' : 's'} · {fmtMoney(o.total_amount)}</span>
              <span className="muted">{o.delivered_date ? `Delivered ${fmtDate(o.delivered_date)}` : 'Not delivered yet'}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReturnForm({ order, onBack, onSubmitted }) {
  const meta = useMeta();
  const returnable = order.items.filter((i) => !i.return_id);
  const [itemId, setItemId] = useState(returnable.length === 1 ? returnable[0].id : null);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const late = order.daysSinceDelivery > order.returnWindowDays;

  const submit = async (e) => {
    e.preventDefault();
    if (!itemId) return setError('Choose the item being returned.');
    if (!reason) return setError('Choose a return reason.');
    setError(null);
    setBusy(true);
    try {
      onSubmitted(await api.submitReturn({ orderItemId: itemId, reason, reasonDetails: details }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="order-summary">
        <div>
          <div className="eyebrow">Order</div>
          <div className="mono strong big">{order.order_number}</div>
        </div>
        <div>
          <div className="eyebrow">Customer</div>
          <div className="strong">{order.customer_name}</div>
          <div className="muted small">{order.customer_email}</div>
        </div>
        <div>
          <div className="eyebrow">Delivered</div>
          <div className="strong">{order.delivered_date ? fmtDate(order.delivered_date) : 'Not yet'}</div>
          {order.delivered_date && (
            <div className={`small ${late ? 'error-text' : 'muted'}`}>
              {order.daysSinceDelivery} days ago · {order.returnWindowDays}-day window{late ? ' (expired)' : ''}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-quiet" onClick={onBack}>Change order</button>
      </div>

      {!order.delivered_date && <p className="error">This order hasn't been delivered yet, so nothing can be returned.</p>}
      {order.delivered_date && !returnable.length && (
        <p className="error">Every item on this order already has a return, so there is nothing left to return.</p>
      )}

      <fieldset className="field">
        <legend>Which item is being returned?</legend>
        <div className="item-choices">
          {order.items.map((i) => {
            const taken = Boolean(i.return_id);
            return (
              <label key={i.id} className={`item-choice ${taken ? 'disabled' : ''} ${itemId === i.id ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="item"
                  disabled={taken || !order.delivered_date}
                  checked={itemId === i.id}
                  onChange={() => setItemId(i.id)}
                />
                <span className="item-choice-body">
                  <span className="strong">{i.product_name}</span>
                  <span className="muted small">{meta.categories[i.category]?.label} · {i.sku} · {fmtMoney(i.unit_price * i.quantity)}</span>
                  {taken && (
                    <span className="small">
                      Already returned — <Link to={`/returns/${i.return_id}`}>view return</Link>
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="form-grid">
        <label className="field">
          <span>Reason for return</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {Object.entries(meta.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Customer's comments <span className="muted">(optional)</span></span>
          <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn btn-primary" disabled={busy || !returnable.length || !order.delivered_date}>
          {busy ? 'Scoring…' : 'Submit & score return'}
        </button>
      </div>
    </form>
  );
}

function ReturnResult({ order, result }) {
  const meta = useMeta();
  const { assessment, status, id } = result;
  const queued = status === 'pending_review';
  return (
    <>
      <section className={`card outcome ${queued ? 'outcome-queued' : 'outcome-approved'}`}>
        <div>
          <StatusPill status={status} label={meta.statuses[status]} />
          <h2>
            {queued
              ? 'Sent to the review queue — do not refund yet'
              : 'Approved automatically — the refund can go ahead'}
          </h2>
          <p className="muted">
            Return #{id} for order <span className="mono">{order.order_number}</span> ({order.customer_name}).
          </p>
        </div>
        <Link className="btn" to={`/returns/${id}`}>Open return</Link>
      </section>
      <RiskExplanation {...assessment} />
    </>
  );
}
