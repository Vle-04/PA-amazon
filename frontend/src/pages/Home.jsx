import { Link } from 'react-router';
import { api } from '../api.js';
import { Loader, ProductCard, useAsync } from '../ui.jsx';

export default function Home() {
  const state = useAsync(() => Promise.all([api('/categories'), api('/products?sort=newest&pageSize=12')]), []);
  return (
    <Loader state={state}>
      {([cats, products]) => (
        <>
          <section className="hero">
            <h1>Everything from Armenian sellers, in one cart.</h1>
            <p>Buy from several stores at once and pay cash when it arrives, anywhere from Yerevan to Syunik.</p>
          </section>
          <section>
            <h2>Shop by category</h2>
            <div className="cat-grid">
              {cats.categories.map((c) => (
                <Link key={c.id} to={`/category/${c.slug}`} className="cat-tile">
                  <span>{c.name}</span>
                  <span className="muted small">{c.count} items</span>
                </Link>
              ))}
            </div>
          </section>
          <section>
            <div className="section-head">
              <h2>New arrivals</h2>
              <Link to="/search?sort=newest">See all ›</Link>
            </div>
            <div className="grid">
              {products.items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          </section>
        </>
      )}
    </Loader>
  );
}
