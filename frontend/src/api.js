import axios from 'axios';

// Resolve Backend Base URL safely
let rawBackendUrl = process.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_API_URL;

if (!rawBackendUrl) {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    rawBackendUrl = window.location.origin;
  } else {
    rawBackendUrl = 'http://localhost:5000';
  }
}

// Strip trailing slashes
const cleanUrl = rawBackendUrl.trim().replace(/\/+$/, '');

// Avoid double /api/api if user sets URL with trailing /api
const BACKEND_URL = cleanUrl.endsWith('/api') ? cleanUrl.slice(0, -4) : cleanUrl;
const API_BASE_URL = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
});


// Request interceptor to automatically attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle unauthorized 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export { BACKEND_URL };
export default api;
