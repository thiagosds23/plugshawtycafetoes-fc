import { API_URL, authHeaders } from '../config';

// No plano gratuito do Render o servidor "dorme" sem uso e leva até ~50s para voltar.
// Quando uma chamada passa deste tempo, o app avisa (evento "servidor-lento") em vez de
// parecer travado; o aviso some quando a última chamada lenta termina.
const AVISO_APOS_MS = 4000;
let chamadasLentas = 0;
const avisar = (lento) => window.dispatchEvent(new CustomEvent('servidor-lento', { detail: lento }));

/** fetch que dispara o aviso de servidor lento. Use no lugar de fetch para a API. */
export function fetchAcompanhado(url, opcoes) {
  let ficouLenta = false;
  const timer = setTimeout(() => {
    ficouLenta = true;
    chamadasLentas += 1;
    if (chamadasLentas === 1) avisar(true);
  }, AVISO_APOS_MS);

  return fetch(url, opcoes).finally(() => {
    clearTimeout(timer);
    if (ficouLenta) {
      chamadasLentas -= 1;
      if (chamadasLentas === 0) avisar(false);
    }
  });
}

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
    res = await fetchAcompanhado(`${API_URL}${path}`, {
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
