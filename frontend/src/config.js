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

/**
 * Cabeçalho que identifica quem está fazendo a requisição: o token assinado que o
 * servidor devolveu no login. Sem ele as ações que exigem login respondem 401.
 */
export const authHeaders = (user, extra = {}) => ({
  ...extra,
  ...(user && user.token ? { Authorization: `Bearer ${user.token}` } : {})
});

/** Administrador do clube, definido pela coluna is_admin do banco. */
export const isAdminUser = (user) => !!(user && Number(user.is_admin) === 1);
