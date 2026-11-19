import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, History, Loader, STATUS_LABEL, StatusBadge, amd, fmtDateTime, useAsync } from '../ui.jsx';
import { Address } from './Orders.jsx';

const TABS = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const MOVE_LABEL = { confirmed: 'Confirm order', shipped: 'Mark as shipped', delivered: 'Mark as delivered (cash collected)', cancelled: 'Cancel order' };

export function SellerOrders() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const state = useAsync(() => api(`/seller/orders${status ? `?status=${status}` : ''}`), [status]);
  const counts = state.data?.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div>
      <h1>Incoming orders</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!status} className={!status ? 'active' : ''} onClick={() => setParams({})}>All <span className="count">{all}</span></button>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={status === t} className={status === t ? 'active' : ''} onClick={() => setParams({ status: t })}>
            {STATUS_LABEL[t]} <span className="count">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>
      <Loader state={state}>
        {(d) => d.items.length === 0 ? <div className="empty"><p>No orders here.</p></div> : (
          <div className="order-list">
            {d.items.map((o) => (
              <Link key={o.id} to={`/seller/orders/${o.id}`} className="card order-row">
                <div><div className="small muted">Order</div><strong>{o.number}</strong></div>
                <div><div className="small muted">Placed</div>{fmtDateTime(o.createdAt)}</div>
                <div><div className="small muted">Ship to</div>{o.recipient}<div className="small muted">{o.city}, {o.region}</div></div>
                <div><div className="small muted">{o.units} units · cash</div><strong>{amd(o.subtotal)}</strong></div>
                <div><StatusBadge status={o.status} /></div>
              </Link>
            ))}
          </div>
        )}
      </Loader>
    </div>
  );
}

export function SellerOrderDetail() {
  const { id } = useParams();
  const { notify } = useApp();
  const state = useAsync(() => api(`/seller/orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const move = async (to) => {
    if (to === 'cancelled' && !confirm('Cancel this order? The items go back to stock.')) return;
    setBusy(true);
    setError(null);
    try {
      state.setData(await api(`/seller/orders/${id}/status`, { method: 'POST', body: { status: to } }));
      notify(`Order ${STATUS_LABEL[to].toLowerCase()}`);
    } catch (e) {
      setError(e);
      state.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Loader state={state}>
      {({ order: o }) => (
        <div>
          <nav className="crumbs small"><Link to="/seller/orders">Incoming orders</Link> › {o.number}</nav>
          <div className="order-head">
            <div><h1>Order {o.number}</h1><div className="muted small">Placed {fmtDateTime(o.createdAt)} · <StatusBadge status={o.status} /></div></div>
            <div className="cash"><div className="small muted">Cash to collect</div><div className="big-price">{o.status === 'cancelled' ? amd(0) : amd(o.cashToCollect)}</div></div>
          </div>
          {o.allowedMoves.length > 0 && (
            <div className="card form moves">
              <h2>Next step</h2>
              <div className="move-buttons">
                {o.allowedMoves.map((m) => (
                  <button key={m} disabled={busy} className={`btn ${m === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} onClick={() => move(m)}>{MOVE_LABEL[m]}</button>
                ))}
              </div>
              <ErrorBox error={error} />
            </div>
          )}
          <div className="two-col">
            <div className="card form">
              <h2>Deliver to</h2>
              <Address a={o.address} />
            </div>
            <div className="card form">
              <h2>Status history</h2>
              <History history={o.history} />
            </div>
          </div>
          <div className="card form">
            <h2>Items (at purchase price)</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Item</th><th className="num">Unit price</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.productId}><td>{i.title}</td><td className="num">{amd(i.unitPrice)}</td><td className="num">{i.quantity}</td><td className="num">{amd(i.unitPrice * i.quantity)}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Cash to collect</td><td className="num"><strong>{amd(o.cashToCollect)}</strong></td></tr></tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </Loader>
  );
}
