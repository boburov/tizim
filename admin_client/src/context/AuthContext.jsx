import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

/**
 * YAGONA sessiya konteksti — super admin ham, mijoz ham shu yerda.
 *
 * Server /auth/me javobida `kind` qaytaradi:
 *   kind: "admin"    -> user    (super admin yoki AdminUser)
 *   kind: "customer" -> customer (oddiy foydalanuvchi)
 *
 * Frontend shunga qarab qaysi panelni ko'rsatishini hal qiladi.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { kind, user? , customer? }
  const [loading, setLoading] = useState(true);

  // Sahifa ochilganda joriy sessiyani tekshiramiz (cookie orqali).
  // Google callback'dan qaytganda ham shu ishlaydi — cookie o'rnatilgan bo'ladi.
  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setSession(res.data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setSession(res.data);
    return res.data;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => null);
    setSession(null);
  };

  const isAdmin = session?.kind === 'admin';
  const isCustomer = session?.kind === 'customer';

  return (
    <AuthContext.Provider
      value={{
        session,
        // Eski kod `user` ni kutadi — admin bo'lsa o'shani beramiz.
        user: isAdmin ? session.user : null,
        customer: isCustomer ? session.customer : null,
        isAdmin,
        isCustomer,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida bo\'lishi kerak');
  return ctx;
}
