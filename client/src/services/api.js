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

// On timeout or network error, show a clear console message (not silent hang)
api.interceptors.response.use(
  res => res,
  err => {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      console.warn('[API] Request timed out — server may be starting up. Retrying in 3s…', err.config?.url);
    }
    return Promise.reject(err);
  }
);

export default api;
