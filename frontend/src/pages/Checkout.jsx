import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, newRequestKey } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, Field, Loader, REGIONS, amd, useAsync } from '../ui.jsx';

export default function Checkout() {
  const state = useAsync(() => Promise.all([api('/cart'), api('/orders/last-address')]), []);
  return <Loader state={state}>{([c, a]) => <CheckoutForm cart={c.cart} initial={a.address} />}</Loader>;
}

function CheckoutForm({ cart, initial }) {
  const { setCartCount } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState({ recipient: '', phone: '', region: 'Yerevan', city: '', street: '', building: '', apartment: '', note: '', ...initial });
  const [error, setError] = useState(null);
  const [placing, setPlacing] = useState(false);
  // DR-6: one key per checkout attempt; a double click or retry reuses it.
  const requestKey = useRef(newRequestKey());

  useEffect(() => { if (!cart.groups.length) navigate('/cart', { replace: true }); }, [cart, navigate]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (placing) return;
    setPlacing(true);
    setError(null);
    try {
      const { order } = await api('/orders', { method: 'POST', body: { ...f, requestKey: requestKey.current } });
      setCartCount(0);
      navigate(`/orders/${order.id}?placed=1`, { replace: true });
    } catch (err) {
      setError(err);
      setPlacing(false);
    }
  };

  const fe = error?.fields || {};
  const cartProblem = error && ['PRICE_CHANGED', 'OUT_OF_STOCK', 'EMPTY_CART'].includes(error.code);
  return (
    <form className="checkout" onSubmit={submit} noValidate>
      <section>
        <h1>Checkout</h1>
        {cartProblem && (
          <div className="alert alert-error" role="alert">
            <strong>{error.message}</strong>
            {error.details.items && (
              <ul>
                {error.details.items.map((i) => (
                  <li key={i.productId}>
                    {i.title}: {i.newPrice != null ? <>new price <strong>{amd(i.newPrice)}</strong> (was {amd(i.oldPrice)})</> : `${i.stock} left`}
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-sm" to="/cart">Review cart</Link>
          </div>
        )}
        <div className="card form">
          <h2>1. Delivery address</h2>
          <div className="row2">
            <Field label="Recipient name" id="recipient" error={fe.recipient}><input id="recipient" autoComplete="name" value={f.recipient} onChange={set('recipient')} /></Field>
            <Field label="Phone" id="phone" error={fe.phone}><input id="phone" type="tel" autoComplete="tel" placeholder="+374 91 123456" value={f.phone} onChange={set('phone')} /></Field>
          </div>
          <div className="row2">
            <Field label="Region" id="region" error={fe.region}>
              <select id="region" value={f.region} onChange={set('region')}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
            </Field>
            <Field label="City / village" id="city" error={fe.city}><input id="city" autoComplete="address-level2" value={f.city} onChange={set('city')} /></Field>
          </div>
          <Field label="Street" id="street" error={fe.street}><input id="street" autoComplete="address-line1" value={f.street} onChange={set('street')} /></Field>
          <div className="row2">
            <Field label="Building" id="building" error={fe.building}><input id="building" value={f.building} onChange={set('building')} /></Field>
            <Field label="Apartment (optional)" id="apartment" error={fe.apartment}><input id="apartment" value={f.apartment} onChange={set('apartment')} /></Field>
          </div>
          <Field label="Note for the courier (optional)" id="note" error={fe.note}>
            <textarea id="note" rows={2} value={f.note} onChange={set('note')} placeholder="Entrance code, best time to call…" />
          </Field>
        </div>
        <div className="card form">
          <h2>2. Payment</h2>
          <label className="radio"><input type="radio" checked readOnly /> Cash on delivery — pay each seller's courier when your items arrive.</label>
        </div>
        <div className="card form">
          <h2>3. Review items</h2>
          {cart.groups.map((g) => (
            <div key={g.sellerId} className="review-group">
              <div className="small muted">From {g.storeName}</div>
              {g.items.map((i) => (
                <div key={i.productId} className="summary-row"><span>{i.quantity} × {i.title}</span><span>{amd(i.lineTotal)}</span></div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <aside className="card summary">
        <div className="summary-row"><span>Items ({cart.count})</span><span>{amd(cart.total)}</span></div>
        <div className="summary-row"><span>Delivery</span><span>Free</span></div>
        <div className="summary-row total"><span>Order total</span><span>{amd(cart.total)}</span></div>
        {error && !cartProblem && !Object.keys(fe).length && <ErrorBox error={error} />}
        {Object.keys(fe).length > 0 && <div className="field-error">Please fix the highlighted fields.</div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={placing || !cart.canCheckout}>
          {placing ? 'Placing your order…' : 'Place order'}
        </button>
        <p className="small muted">Pay {amd(cart.total)} in cash on delivery.</p>
      </aside>
    </form>
  );
}
