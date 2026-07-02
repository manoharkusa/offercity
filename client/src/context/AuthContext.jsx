import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('oc_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('oc_token', data.token);
    localStorage.setItem('oc_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const register = async (formData) => {
    const { data } = await api.post('/auth/register', formData);
    localStorage.setItem('oc_token', data.token);
    localStorage.setItem('oc_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  // OTP/SMS-link flow: server already issued the token — just store it
  const loginWithToken = (token, userData) => {
    localStorage.setItem('oc_token', token);
    localStorage.setItem('oc_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('oc_token');
    localStorage.removeItem('oc_user');
    setUser(null);
  };

  const updateLocation = async (lng, lat) => {
    await api.put('/auth/location', { lng, lat });
  };

  return (
    <AuthContext.Provider value={{ user, login, register, loginWithToken, logout, updateLocation }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
