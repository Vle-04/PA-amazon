import { Link } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Loader, amd, useAsync } from '../ui.jsx';

export default function SellerProducts() {
  const { notify } = useApp();
  const state = useAsync(() => api('/seller/products'), []);
  const toggle = async (p) => {
    try {
      await api(`/seller/products/${p.id}`, { method: 'PATCH', body: { isPublished: !p.isPublished } });
      notify(p.isPublished ? 'Product unpublished' : 'Product published');
      state.reload();
    } catch (e) {
      notify(e.message, 'error');
    }
  };
  return (
    <div>
      <div className="section-head">
        <h1>My products</h1>
        <Link className="btn btn-primary" to="/seller/products/new">+ Add product</Link>
      </div>
      <Loader state={state}>
        {(d) => d.items.length === 0 ? (
          <div className="empty"><p>No products yet.</p><Link className="btn btn-primary" to="/seller/products/new">Add your first product</Link></div>
        ) : (
          <div className="table-wrap card">
            <table className="table">
              <thead><tr><th></th><th>Product</th><th className="num">Price</th><th className="num">Stock</th><th className="num">Units sold</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {d.items.map((p) => (
                  <tr key={p.id} className={p.isPublished ? '' : 'dim'}>
                    <td>{p.thumb && <img className="tiny" src={p.thumb} alt="" />}</td>
                    <td><Link to={`/product/${p.id}`}>{p.title}</Link><div className="small muted">{p.category}</div></td>
                    <td className="num">{amd(p.price)}</td>
                    <td className={`num ${p.stock === 0 ? 'danger' : ''}`}>{p.stock}</td>
                    <td className="num">{p.unitsSold}</td>
                    <td>{p.isPublished ? <span className="badge badge-delivered">Live</span> : <span className="badge badge-cancelled">Unpublished</span>}</td>
                    <td className="actions">
                      <Link className="btn btn-sm" to={`/seller/products/${p.id}/edit`}>Edit</Link>
                      <button className="btn btn-sm" onClick={() => toggle(p)}>{p.isPublished ? 'Unpublish' : 'Publish'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
    </div>
  );
}
