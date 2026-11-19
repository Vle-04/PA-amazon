import { Link, useParams, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { History, Loader, Pagination, StatusBadge, amd, fmtDate, useAsync } from '../ui.jsx';
import { ReviewForm } from './Product.jsx';

export function Orders() {
  const [params] = useSearchParams();
  const page = params.get('page') || '1';
  const state = useAsync(() => api(`/orders?page=${page}`), [page]);
  return (
    <div>
      <h1>Your orders</h1>
      <Loader state={state}>
        {(d) => d.items.length === 0 ? (
          <div className="empty"><p>You have not placed any orders yet.</p><Link className="btn" to="/">Start shopping</Link></div>
        ) : (
          <>
            <div className="order-list">
              {d.items.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`} className="card order-row">
                  <div><div className="small muted">Order</div><strong>{o.number}</strong></div>
                  <div><div className="small muted">Placed</div>{fmtDate(o.createdAt)}</div>
                  <div><div className="small muted">Total</div>{amd(o.total)}</div>
                  <div className="order-parts">
                    {o.parts.map((p) => <div key={p.id} className="small">{p.storeName}: <StatusBadge status={p.status} /></div>)}
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={d.page} pages={d.pages} hrefFor={(n) => `/orders?page=${n}`} />
          </>
        )}
      </Loader>
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { notify } = useApp();
  const state = useAsync(() => api(`/orders/${id}`), [id]);

  const cancel = async (partId, store) => {
    if (!confirm(`Cancel the items from ${store}?`)) return;
    try {
      const d = await api(`/orders/${id}/parts/${partId}/cancel`, { method: 'POST' });
      state.setData(d);
      notify('Cancelled. The items were returned to stock.');
    } catch (e) {
      notify(e.message, 'error');
      state.reload();
    }
  };

  return (
    <Loader state={state}>
      {({ order: o }) => (
        <div>
          {params.get('placed') && (
            <div className="alert alert-ok confirm-box">
              <h1>Thank you, your order is placed!</h1>
              <p>Order number <strong className="order-no">{o.number}</strong>. Pay {amd(o.total)} in cash on delivery.</p>
            </div>
          )}
          <nav className="crumbs small"><Link to="/orders">Your orders</Link> › {o.number}</nav>
          <div className="order-head">
            <div><h1>Order {o.number}</h1><div className="muted small">Placed {fmtDate(o.createdAt)}</div></div>
            <div className="big-price">{amd(o.total)}</div>
          </div>
          <div className="card form">
            <h2>Delivery address</h2>
            <Address a={o.address} />
          </div>
          {o.parts.map((p) => (
            <div key={p.id} className="card form">
              <div className="group-head">
                <span>From <strong>{p.storeName}</strong> · <StatusBadge status={p.status} /></span>
                <span>Cash to pay: <strong>{p.status === 'cancelled' ? amd(0) : amd(p.subtotal)}</strong></span>
              </div>
              {p.items.map((i) => (
                <div key={i.productId} className="order-item">
                  <Link to={`/product/${i.productId}`} className="cart-thumb">{i.thumb && <img src={i.thumb} alt="" />}</Link>
                  <div className="cart-main">
                    <Link to={`/product/${i.productId}`}>{i.title}</Link>
                    <div className="small muted">{i.quantity} × {amd(i.unitPrice)}</div>
                    {i.canReview && (
                      <details className="review-inline">
                        <summary className="link-btn">Write a review</summary>
                        <ReviewForm compact productId={i.productId} onDone={state.reload} />
                      </details>
                    )}
                    {i.reviewed && <div className="small ok">✓ Reviewed</div>}
                  </div>
                  <div className="cart-line">{amd(i.unitPrice * i.quantity)}</div>
                </div>
              ))}
              <h3>Status history</h3>
              <History history={p.history} />
              {p.canCancel && <button className="btn btn-danger btn-sm" onClick={() => cancel(p.id, p.storeName)}>Cancel these items</button>}
            </div>
          ))}
        </div>
      )}
    </Loader>
  );
}

export function Address({ a }) {
  return (
    <address>
      <strong>{a.recipient}</strong> · <a href={`tel:${a.phone.replace(/\s/g, '')}`}>{a.phone}</a><br />
      {a.street} {a.building}{a.apartment ? `, apt ${a.apartment}` : ''}<br />
      {a.city}, {a.region}
      {a.note && <><br /><span className="muted">Note: {a.note}</span></>}
    </address>
  );
}
