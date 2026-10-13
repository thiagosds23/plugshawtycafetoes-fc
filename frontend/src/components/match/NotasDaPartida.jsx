import React, { useMemo, useState } from 'react';
import { Star, ChevronDown } from 'lucide-react';
import { corDaNota, formatarNota, getPrimaryName } from '../../utils/formatters';
import NotaClicavel from '../NotaClicavel';

const nomeDe = (username, nickname) => getPrimaryName({ username, nickname });

/** Agrupa as notas por um lado (quem recebeu ou quem deu), da maior média para a menor. */
function agrupar(notas, chaveDoGrupo, nomeDoGrupo, nomeDoOutro) {
  const grupos = new Map();
  notas.forEach(n => {
    const id = n[chaveDoGrupo];
    if (!grupos.has(id)) grupos.set(id, { id, nome: nomeDoGrupo(n), itens: [] });
    grupos.get(id).itens.push({
      nome: nomeDoOutro(n),
      nota: Number(n.score),
      propria: Number(n.rater_id) === Number(n.rated_id)
    });
  });
  return [...grupos.values()]
    .map(g => ({
      ...g,
      media: g.itens.reduce((s, i) => s + i.nota, 0) / g.itens.length,
      itens: g.itens.sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome))
    }))
    .sort((a, b) => b.media - a.media || a.nome.localeCompare(b.nome));
}

/**
 * Notas da partida, abertas para todo mundo (inclusive durante a votação): quem deu
 * qual nota a quem.
 */
export default function NotasDaPartida({ ratings = [], matchId = null }) {
  const [visao, setVisao] = useState('recebidas');

  const comAvaliador = useMemo(() => ratings.filter(r => r.rater_id !== null && r.rater_id !== undefined), [ratings]);
  const recebidas = useMemo(() => agrupar(
    comAvaliador, 'rated_id',
    n => nomeDe(n.username, n.nickname),
    n => nomeDe(n.rater_username, n.rater_nickname)
  ), [comAvaliador]);
  const dadas = useMemo(() => agrupar(
    comAvaliador, 'rater_id',
    n => nomeDe(n.rater_username, n.rater_nickname),
    n => nomeDe(n.username, n.nickname)
  ), [comAvaliador]);

  if (comAvaliador.length === 0) return null;

  const grupos = visao === 'recebidas' ? recebidas : dadas;
  const botaoDaVisao = (chave, rotulo) => (
    <button
      type="button"
      className={`btn ${visao === chave ? '' : 'btn-secondary'}`}
      aria-pressed={visao === chave}
      onClick={() => setVisao(chave)}
      style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', borderRadius: '10px', fontWeight: visao === chave ? 800 : 600 }}
    >
      {rotulo}
    </button>
  );

  return (
    <section style={{ marginTop: '24px', paddingTop: '18px', borderTop: '1px solid var(--border)' }} aria-labelledby="notas-da-partida-titulo">
      <h5 id="notas-da-partida-titulo" className="font-extrabold flex items-center gap-2" style={{ fontSize: '0.95rem', margin: '0 0 4px', color: '#fbbf24' }}>
        <Star size={18} /> Notas da Partida ({comAvaliador.length})
      </h5>
      <p className="text-muted" style={{ fontSize: '0.76rem', margin: '0 0 12px' }}>
        Quem deu qual nota a quem, inclusive durante a votação. Toque na média de um atleta para ver todas as notas dele.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', maxWidth: '440px' }}>
        {botaoDaVisao('recebidas', 'Notas recebidas')}
        {botaoDaVisao('dadas', 'Notas dadas')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {grupos.map(g => (
          <details key={g.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0 12px' }}>
            <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 0' }}>
              <span className="font-extrabold text-main" style={{ fontSize: '0.88rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {g.nome}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {visao === 'recebidas' ? 'média' : 'média que deu'}
                <NotaClicavel atleta={{ id: g.id, username: g.nome }} matchId={matchId}>
                  <strong style={{ color: corDaNota(g.media), fontSize: '0.9rem' }}>{formatarNota(g.media)}</strong>
                </NotaClicavel>
                · {g.itens.length} {g.itens.length === 1 ? 'nota' : 'notas'}
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </summary>
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {g.itens.map((item, i) => (
                <li
                  key={`${item.nome}-${i}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: `1px solid ${corDaNota(item.nota)}55`, fontSize: '0.78rem' }}
                >
                  <span style={{ color: 'var(--text-main)' }}>
                    {visao === 'recebidas' ? 'de ' : 'para '}{item.nome}{item.propria ? ' (a si mesmo)' : ''}
                  </span>
                  <strong style={{ color: corDaNota(item.nota) }}>{item.nota}</strong>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
