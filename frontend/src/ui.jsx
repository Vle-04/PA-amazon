import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

export const amd = (n) => `${Math.round(n).toLocaleString('en-US').replace(/,/g, ' ')} ֏`;
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const STATUS_LABEL = { placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
export const REGIONS = ['Yerevan', 'Aragatsotn', 'Ararat', 'Armavir', 'Gegharkunik', 'Kotayk', 'Lori', 'Shirak', 'Syunik', 'Tavush', 'Vayots Dzor'];

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load, setData: (data) => setState({ loading: false, data, error: null }) };
}

export function Loader({ state, children }) {
  if (state.error) {
    return (
      <div className="empty">
        <p>{state.error.status === 404 ? 'Not found.' : state.error.message}</p>
        <Link className="btn" to="/">Go home</Link>
      </div>
    );
  }
  if (state.loading && !state.data) return <div className="spinner" aria-label="Loading" />;
  return children(state.data);
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Stars({ value, count, size }) {
  if (value == null) return <span className="muted small">No reviews yet</span>;
  const full = Math.round(value);
  return (
    <span className={`stars ${size || ''}`} title={`${value} out of 5`}>
      <span aria-hidden>{'★'.repeat(full)}<span className="off">{'★'.repeat(5 - full)}</span></span>
      <span className="muted small"> {value.toFixed(1)}{count != null ? ` (${count})` : ''}</span>
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} stars`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

export function Field({ label, error, hint, children, id }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-error" role="alert">{error.message || String(error)}</div>;
}

export function ProductCard({ p }) {
  return (
    <Link to={`/product/${p.id}`} className="card product-card">
      <div className="thumb">
        {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : null}
        {p.stock === 0 && <span className="soldout">Sold out</span>}
      </div>
      <div className="card-body">
        <div className="title">{p.title}</div>
        <Stars value={p.rating} count={p.reviewCount} />
        <div className="price">{amd(p.price)}</div>
        <div className="muted small">{p.storeName}</div>
      </div>
    </Link>
  );
}

export function Pagination({ page, pages, hrefFor }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) nums.push(i);
  return (
    <nav className="pagination" aria-label="Pages">
      {page > 1 && <Link to={hrefFor(page - 1)}>‹ Prev</Link>}
      {nums[0] > 1 && <><Link to={hrefFor(1)}>1</Link>{nums[0] > 2 && <span>…</span>}</>}
      {nums.map((n) => (n === page ? <span key={n} className="current" aria-current="page">{n}</span> : <Link key={n} to={hrefFor(n)}>{n}</Link>))}
      {nums.at(-1) < pages && <>{nums.at(-1) < pages - 1 && <span>…</span>}<Link to={hrefFor(pages)}>{pages}</Link></>}
      {page < pages && <Link to={hrefFor(page + 1)}>Next ›</Link>}
    </nav>
  );
}

export function History({ history }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={i}>
          <StatusBadge status={h.to} />
          <span className="small muted"> {fmtDateTime(h.at)} · by {h.actor}</span>
        </li>
      ))}
    </ol>
  );
}

export function QtyInput({ value, max, onChange, disabled }) {
  return (
    <div className="qty">
      <button type="button" aria-label="Decrease" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <input type="number" inputMode="numeric" min="1" max={max} value={value} disabled={disabled} aria-label="Quantity"
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0) onChange(n); }} />
      <button type="button" aria-label="Increase" disabled={disabled} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
