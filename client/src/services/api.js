import axios from 'axios';

// In production on cPanel, API is served from the same domain
// In development, Vite proxies /api to localhost:5000
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('oc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
