// Dynamic API URL for Local Development, Vercel, and Cloud Hosting (Render/Railway)
export const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.port === '5173' ? `http://${window.location.hostname}:3001` : '');
