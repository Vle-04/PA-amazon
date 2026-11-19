import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Loader, QtyInput, amd, useAsync } from '../ui.jsx';

export default function Cart() {
  const { setCartCount } = useApp();
  const state = useAsync(() => api('/cart'), []);
  const [itemErrors, setItemErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const apply = (cart) => { state.setData({ cart }); setCartCount(cart.count); };
  const run = async (productId, fn) => {
    setBusy(true);
    try {
      apply((await fn()).cart);
      setItemErrors((e) => ({ ...e, [productId]: null }));
    } catch (err) {
      setItemErrors((e) => ({ ...e, [productId]: err.message }));
    } finally {
      setBusy(false);
    }
  };
  const setQty = (id, quantity) => run(id, () => api(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }));
  const remove = (id) => run(id, () => api(`/cart/items/${id}`, { method: 'DELETE' }));
  const accept = () => run('all', () => api('/cart/accept-prices', { method: 'POST' }));

  return (
    <Loader state={state}>
      {({ cart }) => cart.groups.length === 0 ? (
        <div className="empty">
          <h1>Your cart is empty</h1>
          <Link className="btn btn-primary" to="/">Continue shopping</Link>
        </div>
      ) : (
        <div className="cart-layout">
          <section>
            <h1>Shopping cart</h1>
            {cart.warnings.length > 0 && (
              <div className="alert alert-warn" role="alert">
                <ul>{cart.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                {cart.groups.some((g) => g.items.some((i) => i.priceChanged && !i.soldOut)) && (
                  <button className="btn btn-sm" disabled={busy} onClick={accept}>OK, use the new prices</button>
                )}
              </div>
            )}
            {cart.groups.map((g) => (
              <div key={g.sellerId} className="card seller-group">
                <div className="group-head">
                  <span>Sold by <strong>{g.storeName}</strong></span>
                  <span>Subtotal: <strong>{amd(g.subtotal)}</strong></span>
                </div>
                {g.items.map((i) => (
                  <div key={i.productId} className={`cart-item ${i.soldOut ? 'is-out' : ''}`}>
                    <Link to={`/product/${i.productId}`} className="cart-thumb">{i.thumb && <img src={i.thumb} alt="" />}</Link>
                    <div className="cart-main">
                      <Link to={`/product/${i.productId}`} className="title">{i.title}</Link>
                      <div>
                        <strong>{amd(i.price)}</strong>
                        {i.priceChanged && !i.soldOut && <span className="price-was"> was {amd(i.priceSeen)}</span>}
                      </div>
                      {i.soldOut ? <div className="danger small">Sold out</div>
                        : <div className={`small ${i.stock <= 5 ? 'warn' : 'ok'}`}>{i.stock <= 5 ? `Only ${i.stock} left` : 'In stock'}</div>}
                      <div className="cart-actions">
                        {!i.soldOut && <QtyInput value={i.quantity} max={i.stock} disabled={busy} onChange={(n) => setQty(i.productId, n)} />}
                        <button className="link-btn" disabled={busy} onClick={() => remove(i.productId)}>Remove</button>
                      </div>
                      {itemErrors[i.productId] && <div className="field-error">{itemErrors[i.productId]}</div>}
                    </div>
                    <div className="cart-line">{amd(i.lineTotal)}</div>
                  </div>
                ))}
              </div>
            ))}
          </section>
          <aside className="card summary">
            <div className="summary-row"><span>Items ({cart.count})</span><span>{amd(cart.total)}</span></div>
            <div className="summary-row"><span>Delivery</span><span>Free</span></div>
            <div className="summary-row total"><span>Total</span><span>{amd(cart.total)}</span></div>
            <p className="small muted">{cart.groups.length > 1 ? `Your order will ship from ${cart.groups.length} sellers.` : ' '} Pay cash on delivery.</p>
            {cart.canCheckout
              ? <Link className="btn btn-primary btn-block" to="/checkout">Proceed to checkout</Link>
              : <button className="btn btn-primary btn-block" disabled>Fix the issues above to continue</button>}
          </aside>
        </div>
      )}
    </Loader>
  );
}
