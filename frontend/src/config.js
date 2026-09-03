// Dynamic API URL for Local Development, Vercel, and Cloud Hosting (Render/Railway)
export const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.port === '5173' ? `http://${window.location.hostname}:3001` : '');

export const formatPhotoUrl = (photo) => {
  if (!photo) return '';
  if (photo.startsWith('data:') || photo.startsWith('http://') || photo.startsWith('https://')) {
    return photo;
  }
  return `${API_URL}${photo}`;
};
