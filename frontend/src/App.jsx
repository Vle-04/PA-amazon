import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams, useParams } from 'react-router';
import { useApp } from './app-context.jsx';
import { api } from './api.js';
import Home from './pages/Home.jsx';
import Browse from './pages/Browse.jsx';
import Product from './pages/Product.jsx';
import { Login, Register, VerifyEmail } from './pages/Auth.jsx';
import Account from './pages/Account.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import { Orders, OrderDetail } from './pages/Orders.jsx';
import SellerHome from './pages/SellerHome.jsx';
import SellerProducts from './pages/SellerProducts.jsx';
import ProductForm from './pages/ProductForm.jsx';
import { SellerOrders, SellerOrderDetail } from './pages/SellerOrders.jsx';

function RequireAuth({ children, seller }) {
  const { user } = useApp();
  const loc = useLocation();
  if (user === undefined) return <div className="spinner" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (seller && !user.isSeller) return <Navigate to="/seller" replace />;
  return children;
}

function SearchBox() {
  const [params] = useSearchParams();
  const loc = useLocation();
  const [q, setQ] = useState(params.get('q') || '');
  const navigate = useNavigate();
  useEffect(() => { if (loc.pathname === '/search') setQ(params.get('q') || ''); }, [params, loc.pathname]);
  return (
    <form className="search" role="search" onSubmit={(e) => {
      e.preventDefault();
      const p = new URLSearchParams(loc.pathname === '/search' ? params : undefined);
      if (q.trim()) p.set('q', q.trim()); else p.delete('q');
      p.delete('page');
      navigate(`/search?${p}`);
    }}>
      <input type="search" placeholder="Search Shuka" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="submit" aria-label="Search">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.38A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" /></svg>
      </button>
    </form>
  );
}

function AccountMenu() {
  const { user, setUser, setCartCount, notify } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (user === undefined) return null;
  if (!user) return <Link className="nav-link" to="/login">Sign in</Link>;
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setCartCount(0);
    notify('Signed out');
    navigate('/');
  };
  return (
    <div className="menu">
      <button className="nav-link menu-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="small muted-inv">Hello, {user.name.split(' ')[0]}</span>
        <span>Account ▾</span>
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <Link to="/orders" role="menuitem">My orders</Link>
          <Link to="/account" role="menuitem">Profile &amp; settings</Link>
          {user.isSeller ? (
            <>
              <Link to="/seller" role="menuitem">Seller dashboard</Link>
              <Link to="/seller/products" role="menuitem">My products</Link>
              <Link to="/seller/orders" role="menuitem">Incoming orders</Link>
            </>
          ) : <Link to="/seller" role="menuitem">Start selling</Link>}
          <button role="menuitem" onClick={logout}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { cartCount, user } = useApp();
  return (
    <header className="header">
      <div className="header-row container">
        <Link to="/" className="logo">shuka<span>.am</span></Link>
        <SearchBox />
        <nav className="nav">
          {user?.isSeller ? <NavLink className="nav-link hide-sm" to="/seller">Sell</NavLink> : user ? <NavLink className="nav-link hide-sm" to="/seller">Start selling</NavLink> : null}
          {user && <NavLink className="nav-link hide-sm" to="/orders">Orders</NavLink>}
          <AccountMenu />
          <NavLink className="nav-link cart-link" to="/cart" aria-label={`Cart, ${cartCount} items`}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden><path fill="currentColor" d="M7 18a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM1 2h3.27l.94 2H21a1 1 0 0 1 .88 1.47l-3.58 6.49A2 2 0 0 1 16.55 13H8.1l-.9 1.63-.03.12a.25.25 0 0 0 .25.25H19v2H7a2 2 0 0 1-1.76-2.95l1.36-2.45L3 4H1V2Z" /></svg>
            <span className="cart-count">{cartCount}</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">{toast.message}</div>;
}

function CategoryRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/search?category=${encodeURIComponent(slug)}`} replace />;
}

export default function App() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <Header />
      <main className="container main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Browse />} />
          <Route path="/category/:slug" element={<CategoryRedirect />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="/seller" element={<RequireAuth><SellerHome /></RequireAuth>} />
          <Route path="/seller/products" element={<RequireAuth seller><SellerProducts /></RequireAuth>} />
          <Route path="/seller/products/new" element={<RequireAuth seller><ProductForm /></RequireAuth>} />
          <Route path="/seller/products/:id/edit" element={<RequireAuth seller><ProductForm /></RequireAuth>} />
          <Route path="/seller/orders" element={<RequireAuth seller><SellerOrders /></RequireAuth>} />
          <Route path="/seller/orders/:id" element={<RequireAuth seller><SellerOrderDetail /></RequireAuth>} />
          <Route path="*" element={<div className="empty"><h1>Page not found</h1><Link className="btn" to="/">Go home</Link></div>} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">Shuka · Armenian marketplace · Cash on delivery across Armenia</div>
      </footer>
      <Toast />
    </>
  );
}
