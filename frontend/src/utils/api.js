import { API_URL, authHeaders } from '../config';

/**
 * Chamada à API com o token do usuário e tratamento de erro num lugar só.
 *
 * Devolve o JSON da resposta. Se o servidor responder com erro, lança um Error com a
 * mensagem que ele mandou (ex.: "Apenas o administrador pode fazer isso."), pronta
 * para mostrar ao usuário. Sessão expirada (401) dispara o evento "sessao-expirada",
 * que o AuthContext usa para mandar o usuário entrar de novo.
 *
 *   const partida = await api(`/matches/${id}`, { user });
 *   await api('/ratings', { method: 'POST', body: { match_id, ratings }, user });
 */
export async function api(path, { method = 'GET', body, user, signal } = {}) {
  const ehFormulario = typeof FormData !== 'undefined' && body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: authHeaders(user, body && !ehFormulario ? { 'Content-Type': 'application/json' } : {}),
      body: body === undefined ? undefined : (ehFormulario ? body : JSON.stringify(body))
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && user && user.token) {
      window.dispatchEvent(new CustomEvent('sessao-expirada'));
    }
    throw new Error((data && data.error) || `Erro ${res.status} ao falar com o servidor.`);
  }
  return data;
}
