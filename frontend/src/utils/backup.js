import { API_URL, authHeaders } from '../config';
import { fetchAcompanhado } from './api';

/**
 * Baixa o backup completo do clube (GET /admin/backup, só administrador) como arquivo.
 *
 * O servidor já devolve o JSON pronto como anexo, então a resposta vai direto para um
 * blob. Antes ela passava por JSON.parse + JSON.stringify, o que dobrava a memória e
 * travava o celular quando o banco crescia.
 *
 * Lança Error com a mensagem do servidor quando ele recusa (ex.: não é administrador).
 * Não usa o api() porque ele sempre lê a resposta como JSON.
 */
export async function baixarBackup(user) {
  let res;
  try {
    res = await fetchAcompanhado(`${API_URL}/admin/backup`, { headers: authHeaders(user) });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    // Mesmo tratamento do api(): sessão expirada manda o usuário entrar de novo
    if (res.status === 401 && user && user.token) {
      window.dispatchEvent(new CustomEvent('sessao-expirada'));
    }
    throw new Error((data && data.error) || `Erro ${res.status} ao gerar o backup.`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup-plugshawty-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar no mesmo instante do clique cancela o download em alguns navegadores
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
