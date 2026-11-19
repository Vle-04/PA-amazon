import { Link } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Loader, STATUS_LABEL, amd, useAsync } from '../ui.jsx';
import { BecomeSeller } from './Account.jsx';

export default function SellerHome() {
  const { user } = useApp();
  if (!user.isSeller) return <div className="narrow"><BecomeSeller /></div>;
  return <Dashboard />;
}

function Dashboard() {
  const { user } = useApp();
  const state = useAsync(() => api('/seller/stats'), []);
  return (
    <div>
      <div className="section-head">
        <div><h1>{user.storeName}</h1><div className="muted small">Seller dashboard</div></div>
        <Link className="btn btn-primary" to="/seller/products/new">+ Add product</Link>
      </div>
      <Loader state={state}>
        {(s) => (
          <>
            <div className="stats">
              <Link to="/seller/orders?status=placed" className="card stat attention">
                <div className="stat-num">{s.toConfirm}</div><div>Orders to confirm</div>
              </Link>
              <Link to="/seller/orders?status=confirmed" className="card stat attention">
                <div className="stat-num">{s.toShip}</div><div>Orders to ship</div>
              </Link>
              <div className="card stat">
                <div className="stat-num">{amd(s.revenue30d)}</div><div>Revenue, last 30 days</div>
                <div className="small muted">{s.delivered30d} delivered orders</div>
              </div>
              <Link to="/seller/products" className="card stat">
                <div className="stat-num">{s.products.published}</div><div>Products live</div>
                <div className="small muted">{s.products.total} total · {s.products.soldOut} sold out</div>
              </Link>
            </div>
            <div className="card form">
              <h2>Orders by status</h2>
              <div className="status-bars">
                {Object.entries(s.byStatus).map(([k, v]) => (
                  <Link key={k} to={`/seller/orders?status=${k}`} className="status-bar">
                    <span className={`badge badge-${k}`}>{STATUS_LABEL[k]}</span>
                    <span className="bar"><span style={{ width: `${Math.min(100, (v / Math.max(1, ...Object.values(s.byStatus))) * 100)}%` }} /></span>
                    <strong>{v}</strong>
                  </Link>
                ))}
              </div>
            </div>
            <div className="quick-links">
              <Link className="btn" to="/seller/orders">Manage orders</Link>
              <Link className="btn" to="/seller/products">Manage products</Link>
              <Link className="btn" to="/account">Store settings</Link>
            </div>
          </>
        )}
      </Loader>
    </div>
  );
}
