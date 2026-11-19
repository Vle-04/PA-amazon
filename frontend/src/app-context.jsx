import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [cartCount, setCartCount] = useState(0);
  const [toast, setToast] = useState(null);

  const refreshCart = useCallback(async (u = user) => {
    if (!u) return setCartCount(0);
    try { setCartCount((await api('/cart/count')).count); } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    // Don't let this initial check overwrite a sign-in that finished first (e.g. the email link).
    api('/me').then((d) => setUser((u) => (u === undefined ? d.user : u))).catch(() => setUser((u) => (u === undefined ? null : u)));
  }, []);
  useEffect(() => { if (user !== undefined) refreshCart(user); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  return <Ctx.Provider value={{ user, setUser, cartCount, setCartCount, refreshCart, notify, toast }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
