import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Star, Swords } from 'lucide-react';
import FundoModal from '../match/FundoModal';
import { api } from '../../utils/api';
import { corDaNota, formatarNota, getPrimaryName } from '../../utils/formatters';
import { NotasDoAtletaContext } from '../../utils/notasDoAtleta';

const dataDaPartida = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Uma nota: "de Calebe 9" (recebidas) ou "para Calebe 9" (dadas). */
function Chip({ texto, nota }) {
  return (
    <li style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: `1px solid ${corDaNota(nota)}55`, fontSize: '0.78rem' }}>
      <span style={{ color: 'var(--text-main)' }}>{texto}</span>
      <strong style={{ color: corDaNota(nota) }}>{nota}</strong>
    </li>
  );
}

/**
 * Janela com todas as notas de um atleta, partida por partida: as que ele recebeu (de
 * quem) e as que ele deu (a quem). As notas são públicas, inclusive durante a votação.
 */
function NotasDoAtletaModal({ atleta, partidaEmDestaque, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState('recebidas');
  const destaque = useRef(null);
  const nome = getPrimaryName(atleta);

  useEffect(() => {
    const controle = new AbortController();
    api(`/users/${atleta.id}/ratings`, { signal: controle.signal })
      .then(setDados)
      .catch(err => {
        if (err.name !== 'AbortError') setErro(err.message);
      });
    return () => controle.abort();
  }, [atleta.id]);

  // Abriu pela nota de uma partida: rola até ela
  useEffect(() => {
    if (dados && destaque.current) destaque.current.scrollIntoView({ block: 'center' });
  }, [dados]);

  const partidas = dados
    ? dados.partidas.filter(p => (visao === 'recebidas' ? p.recebidas : p.dadas).length > 0)
    : [];

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
    <FundoModal tituloId="notas-atleta-titulo" onClose={onClose} estilo={{ zIndex: 1400 }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '18px 16px', background: 'rgba(14, 16, 24, 0.98)' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
          <h3 id="notas-atleta-titulo" className="font-extrabold text-main flex items-center gap-2" style={{ margin: 0, fontSize: '1.05rem' }}>
            <Star size={18} color="#fbbf24" /> Notas de {nome}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fechar notas" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {dados && (
          <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 12px' }}>
            {dados.media_recebida !== null
              ? <>Média recebida <strong style={{ color: corDaNota(dados.media_recebida) }}>{formatarNota(dados.media_recebida)}</strong> em {dados.partidas_com_nota} partida(s)</>
              : 'Ainda não recebeu notas'}
            {dados.media_dada !== null && <> · média que dá <strong style={{ color: 'var(--text-main)' }}>{formatarNota(dados.media_dada)}</strong></>}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {botaoDaVisao('recebidas', 'Notas recebidas')}
          {botaoDaVisao('dadas', 'Notas que deu')}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' }}>
          {erro && <div style={{ color: '#ef4444', fontSize: '0.82rem', textAlign: 'center' }}>{erro}</div>}
          {!dados && !erro && <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.82rem' }}>Carregando...</div>}
          {dados && partidas.length === 0 && (
            <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.82rem', padding: '12px 0' }}>
              {visao === 'recebidas' ? 'Nenhuma nota recebida ainda.' : 'Ainda não deu nenhuma nota.'}
            </div>
          )}
          {partidas.map(p => {
            const emDestaque = Number(p.match_id) === Number(partidaEmDestaque);
            const notas = visao === 'recebidas' ? p.recebidas : p.dadas;
            const mediaDaPartida = visao === 'recebidas' ? p.media_recebida : p.media_dada;
            return (
              <div
                key={p.match_id}
                ref={emDestaque ? destaque : undefined}
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${emDestaque ? 'rgba(251, 191, 36, 0.6)' : 'var(--border)'}`, borderRadius: '12px', padding: '10px 12px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span className="font-extrabold text-main" style={{ fontSize: '0.86rem', display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'capitalize' }}>
                    {dataDaPartida(p.date)}
                    {p.adversario && <span style={{ textTransform: 'none', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Swords size={13} /> vs {p.adversario}</span>}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {p.votacao_aberta && <span style={{ color: '#fbbf24', fontWeight: 700 }}>votação em andamento ·</span>}
                    {visao === 'recebidas' ? 'média' : 'média que deu'}
                    <strong style={{ color: corDaNota(mediaDaPartida), fontSize: '0.88rem' }}>{formatarNota(mediaDaPartida)}</strong>
                    · {notas.length} {notas.length === 1 ? 'nota' : 'notas'}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {notas.map((n, i) => (
                    <Chip
                      key={`${p.match_id}-${i}`}
                      nota={n.nota}
                      texto={visao === 'recebidas'
                        ? `de ${n.de}${n.propria ? ' (a si mesmo)' : ''}`
                        : `para ${n.para}${n.propria ? ' (a si mesmo)' : ''}`}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </FundoModal>
  );
}

/** Deixa qualquer tela abrir o histórico de notas de um atleta (useNotasDoAtleta). */
export default function NotasDoAtletaProvider({ children }) {
  const [aberto, setAberto] = useState(null); // { atleta, matchId }
  const abrir = useCallback((atleta, matchId = null) => {
    if (atleta && atleta.id) setAberto({ atleta, matchId });
  }, []);

  return (
    <NotasDoAtletaContext.Provider value={abrir}>
      {children}
      {aberto && (
        <NotasDoAtletaModal
          key={`${aberto.atleta.id}-${aberto.matchId}`}
          atleta={aberto.atleta}
          partidaEmDestaque={aberto.matchId}
          onClose={() => setAberto(null)}
        />
      )}
    </NotasDoAtletaContext.Provider>
  );
}
