import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthCtx = createContext(null);
export function useAuth() { return useContext(AuthCtx); }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* best-effort */ }
    setToken(null);
    setUser(null);
  }, []);

  // Bootstrap: si hay token guardado, validarlo con /auth/me.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { user } = await api('/auth/me');
        setUser(user);
      } catch (_) { setToken(null); }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api('/auth/login', { method: 'POST', auth: false, body: { username, password } });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  // Auto-logout: al expirar el JWT y por inactividad (30 min).
  useEffect(() => {
    if (!user) return undefined;
    const token = getToken();
    if (!token) return undefined;
    let expTimer;
    let idleTimer;
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      if (payload.exp) {
        expTimer = setTimeout(() => { logout(); }, Math.max(0, payload.exp * 1000 - Date.now()));
      }
    } catch (_) { /* token opaco */ }
    const IDLE_MS = 30 * 60 * 1000;
    const resetIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { logout(); }, IDLE_MS); };
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetIdle));
    resetIdle();
    return () => {
      clearTimeout(expTimer);
      clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, resetIdle));
    };
  }, [user, logout]);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
