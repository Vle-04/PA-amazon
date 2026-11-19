import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, Field, Loader, useAsync } from '../ui.jsx';

const MAX_BYTES = 10 * 1024 * 1024;

export default function ProductForm() {
  const { id } = useParams();
  const state = useAsync(() => Promise.all([api('/categories'), id ? api(`/seller/products/${id}`) : Promise.resolve(null)]), [id]);
  return <Loader state={state}>{([c, p]) => <Form key={id || 'new'} categories={c.categories} product={p?.product} />}</Loader>;
}

function Form({ categories, product }) {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState(() => ({
    title: product?.title || '', description: product?.description || '',
    price: product?.price ?? '', stock: product?.stock ?? '', categoryId: product?.categoryId || '',
    isPublished: product?.isPublished ?? true,
  }));
  const [images, setImages] = useState(product?.images || []);
  const [uploading, setUploading] = useState(0);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fe = error?.fields || {};

  useEffect(() => {
    if (!uploading) return;
    const h = (e) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [uploading]);

  const onFiles = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const room = 5 - images.length;
    const errs = [];
    if (files.length > room) errs.push(`Only ${room} more photo${room === 1 ? '' : 's'} allowed (max 5).`);
    const batch = files.slice(0, Math.max(0, room));
    setUploading((n) => n + batch.length);
    for (const file of batch) {
      if (file.size > MAX_BYTES) {
        errs.push(`${file.name}: too large (max 10 MB).`);
        setUploading((n) => n - 1);
        continue;
      }
      const fd = new FormData();
      fd.append('image', file);
      try {
        const { image } = await api('/uploads', { method: 'POST', form: fd });
        setImages((list) => (list.length < 5 ? [...list, image] : list));
      } catch (err) {
        errs.push(`${file.name}: ${err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setUploadErrors(errs);
  };

  const makeMain = (i) => setImages((l) => [l[i], ...l.filter((_, j) => j !== i)]);
  const removeImg = (i) => setImages((l) => l.filter((_, j) => j !== i));
  const move = (i, d) => setImages((l) => {
    const n = [...l];
    const j = i + d;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      ...f,
      price: f.price === '' ? undefined : Number(f.price),
      stock: f.stock === '' ? undefined : Number(f.stock),
      categoryId: f.categoryId === '' ? undefined : Number(f.categoryId),
      images: images.map((i) => i.key),
    };
    try {
      const r = product
        ? await api(`/seller/products/${product.id}`, { method: 'PUT', body })
        : await api('/seller/products', { method: 'POST', body });
      notify(product ? 'Product saved' : 'Product published');
      navigate(`/product/${r.product.id}`);
    } catch (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="narrow" onSubmit={submit} noValidate>
      <nav className="crumbs small"><Link to="/seller/products">My products</Link> › {product ? 'Edit' : 'New'}</nav>
      <h1>{product ? 'Edit product' : 'Add a product'}</h1>
      {error && <ErrorBox error={error} />}
      <div className="card form">
        <Field label="Title" id="title" error={fe.title}>
          <input id="title" maxLength={120} value={f.title} onChange={set('title')} placeholder="e.g. Handwoven wool carpet" />
        </Field>
        <Field label="Category" id="categoryId" error={fe.categoryId}>
          <select id="categoryId" value={f.categoryId} onChange={set('categoryId')}>
            <option value="">Choose a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="row2">
          <Field label="Price, AMD (֏)" id="price" error={fe.price} hint="Whole dram, no decimals">
            <input id="price" type="number" inputMode="numeric" min="1" step="1" value={f.price} onChange={set('price')} />
          </Field>
          <Field label="Stock (units available)" id="stock" error={fe.stock}>
            <input id="stock" type="number" inputMode="numeric" min="0" step="1" value={f.stock} onChange={set('stock')} />
          </Field>
        </div>
        <Field label="Description" id="description" error={fe.description} hint="At least 10 characters">
          <textarea id="description" rows={6} maxLength={5000} value={f.description} onChange={set('description')} />
        </Field>
      </div>
      <div className={`card form ${fe.images ? 'has-error' : ''}`}>
        <h2>Photos <span className="muted small">({images.length}/5, the first one is the main photo)</span></h2>
        <div className="image-grid">
          {images.map((im, i) => (
            <div key={im.key} className="image-tile">
              <img src={im.thumb} alt="" />
              {i === 0 ? <span className="main-tag">Main</span> : null}
              <div className="image-actions">
                {i > 0 && <button type="button" onClick={() => makeMain(i)} title="Make main">★</button>}
                {i > 0 && <button type="button" onClick={() => move(i, -1)} aria-label="Move left">←</button>}
                {i < images.length - 1 && <button type="button" onClick={() => move(i, 1)} aria-label="Move right">→</button>}
                <button type="button" onClick={() => removeImg(i)} aria-label="Remove photo">✕</button>
              </div>
            </div>
          ))}
          {Array.from({ length: uploading }, (_, i) => <div key={`u${i}`} className="image-tile uploading"><div className="spinner small" /></div>)}
          {images.length + uploading < 5 && (
            <label className="image-tile add">
              <input type="file" accept="image/*" multiple onChange={onFiles} hidden />
              <span>+ Add photos</span>
            </label>
          )}
        </div>
        {fe.images && <div className="field-error">{fe.images}</div>}
        {uploadErrors.map((m) => <div key={m} className="field-error">{m}</div>)}
        <div className="hint">JPEG, PNG, WebP or HEIC up to 10 MB each. We resize them for you.</div>
      </div>
      <div className="card form">
        <label className="checkbox">
          <input type="checkbox" checked={f.isPublished} onChange={(e) => setF({ ...f, isPublished: e.target.checked })} />
          Published (visible to buyers)
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy || uploading > 0}>{uploading ? 'Uploading photos…' : busy ? 'Saving…' : product ? 'Save changes' : 'Publish product'}</button>
        <Link className="btn" to="/seller/products">Cancel</Link>
      </div>
    </form>
  );
}
