import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { ErrorBox, Field } from '../ui.jsx';

function verifyHref(email, params, failed) {
  const p = new URLSearchParams({ email });
  if (params.get('next')) p.set('next', params.get('next'));
  if (failed) p.set('failed', '1');
  return `/verify-email?${p}`;
}

function safeNext(params) {
  const n = params.get('next') || '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export function Login() {
  const { setUser, notify } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: f });
      setUser(user);
      notify(`Welcome back, ${user.name}`);
      navigate(safeNext(params), { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        navigate(verifyHref(err.details.email || f.email, params, err.details.emailSent === false));
        return;
      }
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth card">
      <h1>Sign in</h1>
      <form onSubmit={submit} noValidate>
        <Field label="Email" id="email" error={error?.fields?.email}>
          <input id="email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Password" id="password" error={error?.fields?.password}>
          <input id="password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        {error && !Object.keys(error.fields).length && <ErrorBox error={error} />}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="small center">New to Shuka? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create your account</Link></p>
    </div>
  );
}

export function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/auth/register', { method: 'POST', body: f });
      navigate(verifyHref(d.email, params, d.emailSent === false));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth card">
      <h1>Create account</h1>
      <form onSubmit={submit} noValidate>
        <Field label="Your name" id="name" error={error?.fields?.name}>
          <input id="name" autoComplete="name" value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Email" id="email" error={error?.fields?.email}>
          <input id="email" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Phone (optional)" id="phone" error={error?.fields?.phone}>
          <input id="phone" type="tel" autoComplete="tel" placeholder="+374 91 123456" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Password" id="password" error={error?.fields?.password} hint="At least 8 characters">
          <input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} />
        </Field>
        {error && !Object.keys(error.fields).length && <ErrorBox error={error} />}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="small center">Already have an account? <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Sign in</Link></p>
    </div>
  );
}

export function VerifyEmail() {
  const { setUser, notify } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const email = params.get('email') || '';
  const [code, setCode] = useState(params.get('code') || '');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(params.get('failed') ? 'We could not send the email. Press “Send a new code”.' : null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(params.get('failed') ? 0 : 60);
  const autoTried = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value) => {
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/verify-email', { method: 'POST', body: { email, code: value } });
      setUser(user);
      notify(`Email confirmed. Welcome to Shuka, ${user.name}!`);
      navigate(safeNext(params), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Opened from the link in the email: confirm automatically.
  useEffect(() => {
    if (!autoTried.current && email && /^\d{6}$/.test(params.get('code') || '')) {
      autoTried.current = true;
      verify(params.get('code'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = async () => {
    setError(null);
    setInfo(null);
    try {
      const d = await api('/auth/resend-verification', { method: 'POST', body: { email } });
      setInfo(d.emailSent === false ? 'We could not send the email. Try again in a minute.' : `A new code was sent to ${email}.`);
      setCooldown(60);
    } catch (err) {
      if (err.details.retryAfter) setCooldown(err.details.retryAfter);
      setError(err);
    }
  };

  if (!email) return <Navigate to="/register" replace />;
  return (
    <div className="auth card">
      <h1>Check your email</h1>
      <p>We sent a 6-digit code to <strong>{email}</strong>. Enter it below, or open the link in the email.</p>
      <p className="small muted">Can't find it? Check your Spam or Promotions folder.</p>
      <form onSubmit={(e) => { e.preventDefault(); verify(code); }} noValidate>
        <Field label="Verification code" id="code" error={error?.fields?.code}>
          <input id="code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        </Field>
        {error && !error.fields?.code && <ErrorBox error={error} />}
        {info && <div className="alert">{info}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Confirm email'}</button>
      </form>
      <p className="small center">
        <button type="button" className="link-btn" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </button>
        {' · '}<Link to="/register">Use a different email</Link>
      </p>
    </div>
  );
}
