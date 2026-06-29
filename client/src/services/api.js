import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 12000,  // 12s — if server doesn't respond, fail fast instead of hanging
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('oc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle expired/invalid tokens + timeouts (no silent hang or empty screens)
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    // 401 on a non-login request means our stored token is invalid/expired
    // (e.g. after a server migration that rotated JWT_SECRET). Clear the stale
    // session and bounce to login instead of silently rendering empty data.
    if (status === 401 && !isAuthEndpoint) {
      const hadToken = localStorage.getItem('oc_token');
      localStorage.removeItem('oc_token');
      localStorage.removeItem('oc_user');
      if (hadToken && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      console.warn('[API] Request timed out — server may be starting up. Retrying in 3s…', err.config?.url);
    }
    return Promise.reject(err);
  }
);

export default api;
