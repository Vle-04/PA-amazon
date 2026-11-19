import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, Field } from '../ui.jsx';

export default function Account() {
  const { user, setUser, notify } = useApp();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/me', { method: 'PATCH', body: f });
      setUser(d.user);
      notify('Profile saved');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="narrow">
      <h1>Your account</h1>
      <form className="card form" onSubmit={submit} noValidate>
        <h2>Profile</h2>
        <Field label="Email"><input value={user.email} disabled /></Field>
        <Field label="Name" id="name" error={error?.fields?.name}>
          <input id="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Phone" id="phone" error={error?.fields?.phone}>
          <input id="phone" type="tel" placeholder="+374 91 123456" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        {error && !Object.keys(error.fields).length && <ErrorBox error={error} />}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
      <div className="card form">
        <h2>Selling</h2>
        {user.isSeller ? (
          <>
            <p>Your store <strong>{user.storeName}</strong> is active.</p>
            <Link className="btn" to="/seller">Open seller dashboard</Link>
          </>
        ) : (
          <>
            <p>Anyone can sell on Shuka. It takes a store name and a phone number.</p>
            <Link className="btn" to="/seller">Become a seller</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function BecomeSeller({ onDone }) {
  const { user, setUser, notify } = useApp();
  const [f, setF] = useState({ storeName: user.storeName || '', storePhone: user.storePhone || user.phone || '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/me/seller', { method: 'POST', body: f });
      setUser(d.user);
      notify(user.isSeller ? 'Store details saved' : 'Your store is open! Add your first product.');
      onDone?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{user.isSeller ? 'Store details' : 'Start selling on Shuka'}</h2>
      {!user.isSeller && <p className="muted">Your store is active immediately. Buyers pay you cash on delivery.</p>}
      <Field label="Store name" id="storeName" error={error?.fields?.storeName}>
        <input id="storeName" value={f.storeName} onChange={(e) => setF({ ...f, storeName: e.target.value })} />
      </Field>
      <Field label="Store phone" id="storePhone" error={error?.fields?.storePhone}>
        <input id="storePhone" type="tel" placeholder="+374 91 123456" value={f.storePhone} onChange={(e) => setF({ ...f, storePhone: e.target.value })} />
      </Field>
      {error && !Object.keys(error.fields).length && <ErrorBox error={error} />}
      <button className="btn btn-primary" disabled={busy}>{user.isSeller ? 'Save' : 'Open my store'}</button>
    </form>
  );
}
