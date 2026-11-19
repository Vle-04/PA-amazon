import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, Field, Loader, QtyInput, StarInput, Stars, amd, fmtDate, useAsync } from '../ui.jsx';

export default function Product() {
  const { id } = useParams();
  const state = useAsync(() => api(`/products/${id}`), [id]);
  return <Loader state={state}>{(d) => <ProductView p={d.product} reload={state.reload} />}</Loader>;
}

function ProductView({ p, reload }) {
  const { user, setCartCount, notify } = useApp();
  const loc = useLocation();
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const { cart } = await api('/cart/items', { method: 'POST', body: { productId: p.id, quantity: qty } });
      setCartCount(cart.count);
      notify(`Added ${qty} × ${p.title} to your cart`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const main = p.images[img] || p.images[0];
  return (
    <>
      <nav className="crumbs small"><Link to="/">Home</Link> › <Link to={`/category/${p.category.slug}`}>{p.category.name}</Link></nav>
      {!p.isPublished && <div className="alert">This product is unpublished. Only you can see it.</div>}
      <div className="product">
        <div className="gallery">
          <div className="gallery-main">{main && <img src={main.large} alt={p.title} />}</div>
          {p.images.length > 1 && (
            <div className="gallery-thumbs">
              {p.images.map((im, i) => (
                <button key={im.thumb} className={i === img ? 'active' : ''} onClick={() => setImg(i)} aria-label={`Photo ${i + 1}`}>
                  <img src={im.thumb} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-info">
          <h1>{p.title}</h1>
          <div className="small">Sold by <strong>{p.storeName}</strong></div>
          <a href="#reviews"><Stars value={p.rating} count={p.reviewCount} /></a>
          <hr />
          <div className="big-price">{amd(p.price)}</div>
          <div className="small muted">Cash on delivery · Delivery across Armenia</div>
          <h3>About this item</h3>
          <p className="desc">{p.description}</p>
        </div>
        <div className="buy-box card">
          <div className="big-price">{amd(p.price)}</div>
          {p.stock > 0 ? (
            <div className={p.stock <= 5 ? 'warn' : 'ok'}>{p.stock <= 5 ? `Only ${p.stock} left in stock` : 'In stock'}</div>
          ) : <div className="danger">Sold out</div>}
          {p.isOwn ? (
            <>
              <p className="small muted">This is your product.</p>
              <Link className="btn btn-block" to={`/seller/products/${p.id}/edit`}>Edit product</Link>
            </>
          ) : !user ? (
            <Link className="btn btn-primary btn-block" to={`/login?next=${encodeURIComponent(loc.pathname)}`}>Sign in to buy</Link>
          ) : p.stock > 0 ? (
            <>
              <label className="small">Quantity</label>
              <QtyInput value={qty} max={p.stock} onChange={setQty} />
              <button className="btn btn-primary btn-block" disabled={busy} onClick={add}>{busy ? 'Adding…' : 'Add to cart'}</button>
              <ErrorBox error={error} />
            </>
          ) : null}
        </div>
      </div>
      <section id="reviews" className="reviews">
        <h2>Customer reviews</h2>
        <Stars value={p.rating} count={p.reviewCount} size="lg" />
        {p.canReview && <ReviewForm productId={p.id} onDone={reload} />}
        {p.myReview && <p className="small muted">You reviewed this product.</p>}
        {p.reviews.length === 0 ? (p.canReview ? null : <p className="muted">Bought it? Reviews open once your order is delivered.</p>) : (
          <ul className="review-list">
            {p.reviews.map((r) => (
              <li key={r.id}>
                <div><strong>{r.author}</strong> <span className="muted small">· {fmtDate(r.createdAt)}</span></div>
                <Stars value={r.rating} />
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function ReviewForm({ productId, onDone, compact }) {
  const { notify } = useApp();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, text } });
      notify('Thanks for your review!');
      onDone?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={`review-form ${compact ? 'compact' : 'card'}`} onSubmit={submit}>
      {!compact && <h3>Write a review</h3>}
      <Field label="Your rating" error={error?.fields?.rating}><StarInput value={rating} onChange={setRating} /></Field>
      <Field label="Your review" id={`rv-${productId}`} error={error?.fields?.text}>
        <textarea id={`rv-${productId}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What did you like or dislike?" />
      </Field>
      {error && !Object.keys(error.fields).length && <ErrorBox error={error} />}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Posting…' : 'Post review'}</button>
    </form>
  );
}
