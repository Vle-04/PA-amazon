import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, qs } from '../api.js';
import { Loader, Pagination, ProductCard, useAsync } from '../ui.jsx';

const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Avg. customer rating']];

export default function Browse() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const sort = params.get('sort') || 'newest';
  const page = params.get('page') || '1';

  const cats = useAsync(() => api('/categories'), []);
  const state = useAsync(() => api(`/products${qs({ q, category, minPrice, maxPrice, sort, page, pageSize: 12 })}`), [q, category, minPrice, maxPrice, sort, page]);
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);
  useEffect(() => { setMin(minPrice); setMax(maxPrice); }, [minPrice, maxPrice]);

  const href = (changes) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v === '' || v == null ? p.delete(k) : p.set(k, v));
    if (!('page' in changes)) p.delete('page');
    return `/search?${p}`;
  };
  const catName = cats.data?.categories.find((c) => c.slug === category)?.name;
  const heading = q ? `Results for “${q}”` : catName || 'All products';

  return (
    <div className="browse">
      <aside className="filters">
        <details open={typeof window !== 'undefined' && window.innerWidth > 760}>
          <summary>Filters</summary>
          <h3>Category</h3>
          <ul className="cat-list">
            <li><Link className={!category ? 'active' : ''} to={href({ category: '' })}>All categories</Link></li>
            {cats.data?.categories.map((c) => (
              <li key={c.id}><Link className={c.slug === category ? 'active' : ''} to={href({ category: c.slug })}>{c.name}</Link></li>
            ))}
          </ul>
          <h3>Price, ֏</h3>
          <form className="price-form" onSubmit={(e) => { e.preventDefault(); navigate(href({ minPrice: min, maxPrice: max })); }}>
            <input type="number" inputMode="numeric" min="0" placeholder="Min" aria-label="Minimum price" value={min} onChange={(e) => setMin(e.target.value)} />
            <span>–</span>
            <input type="number" inputMode="numeric" min="0" placeholder="Max" aria-label="Maximum price" value={max} onChange={(e) => setMax(e.target.value)} />
            <button className="btn btn-sm" type="submit">Go</button>
          </form>
          {(minPrice || maxPrice || category || q) && <Link className="small" to="/search">Clear all filters</Link>}
        </details>
      </aside>
      <section className="results">
        <div className="results-head">
          <div>
            <h1>{heading}</h1>
            {state.data && <div className="muted small">{state.data.total} {state.data.total === 1 ? 'result' : 'results'}</div>}
          </div>
          <label className="sort">
            <span className="small muted">Sort by </span>
            <select value={sort} onChange={(e) => navigate(href({ sort: e.target.value }))}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <Loader state={state}>
          {(d) => d.items.length === 0 ? (
            <div className="empty"><p>No products match. Try other words or remove filters.</p></div>
          ) : (
            <>
              <div className="grid">{d.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
              <Pagination page={d.page} pages={d.pages} hrefFor={(n) => href({ page: n })} />
            </>
          )}
        </Loader>
      </section>
    </div>
  );
}
