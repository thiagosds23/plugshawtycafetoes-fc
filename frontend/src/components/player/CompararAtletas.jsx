import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { X, ArrowLeftRight, Share2, Handshake, Swords, Star } from 'lucide-react';
import FutCard from '../FutCard';
import FundoModal from '../match/FundoModal';
import { api } from '../../utils/api';
import { calcOVR, ovrTrend } from '../../utils/ovr';
import { waitForImages } from '../../utils/exportImage';
import { getPrimaryName, notaDoRanking, formatarNota } from '../../utils/formatters';
import '../../fut-card.css';

const ATRIBUTOS = [
  ['pace', 'Ritmo'],
  ['shooting', 'Finalização'],
  ['passing', 'Passe'],
  ['dribbling', 'Drible'],
  ['defending', 'Defesa'],
  ['physical', 'Físico']
];

const COR_A = '#00f59b';
const COR_B = '#00e5ff';
const ANO = new Date().getFullYear();

const dataCurta = (iso) => {
  const [, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}`;
};
const paraArquivo = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

// A carta FUT só tem o layout certo no tamanho normal (310px, fundo quadrado): os
// tamanhos menores estreitam a carta sem diminuir o texto. Aqui ela é desenhada no
// tamanho normal e reduzida inteira com transform, o que também sai certo na imagem.
const LARGURA_DA_CARTA = 310;

function useEscalaDasCartas() {
  const calcular = () => (typeof window !== 'undefined' && window.innerWidth < 560 ? 0.46 : 0.68);
  const [escala, setEscala] = useState(calcular);
  useEffect(() => {
    const aoRedimensionar = () => setEscala(calcular());
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);
  return escala;
}

function CartaReduzida({ player, escala, id }) {
  const lado = LARGURA_DA_CARTA * escala;
  return (
    <div style={{ width: `${lado}px`, height: `${lado}px`, flexShrink: 0 }}>
      <div style={{ width: `${LARGURA_DA_CARTA}px`, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
        <FutCard player={player} id={id} showTrend />
      </div>
    </div>
  );
}

/** Atleta do elenco com o OVR mais parecido, para a comparação já abrir montada. */
function maisParecido(elenco, atleta) {
  if (!atleta) return null;
  const ovr = calcOVR(atleta);
  return [...elenco]
    .filter(p => p.id !== atleta.id)
    .sort((x, y) => Math.abs(calcOVR(x) - ovr) - Math.abs(calcOVR(y) - ovr) || (y.matches_count || 0) - (x.matches_count || 0))[0] || null;
}

/** Uma linha de duelo: valor de A, barra de A, rótulo, barra de B, valor de B. */
function LinhaDeDuelo({ rotulo, valorA, valorB, textoA, textoB, maximo = 99, barras = true }) {
  const aVence = valorA > valorB;
  const bVence = valorB > valorA;
  const largura = (v) => `${Math.max(0, Math.min(100, (v / maximo) * 100))}%`;
  const estiloValor = (vence, cor) => ({
    fontWeight: 900,
    fontSize: '0.92rem',
    color: vence ? cor : 'var(--text-muted)',
    fontVariantNumeric: 'tabular-nums',
    minWidth: '44px'
  });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto 1fr 44px', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
      <span style={{ ...estiloValor(aVence, COR_A), textAlign: 'left' }}>{textoA ?? valorA}</span>
      <div style={{ height: '6px', borderRadius: '4px', background: barras ? 'rgba(255,255,255,0.06)' : 'transparent', display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' }}>
        {barras && <div style={{ width: largura(valorA), background: aVence ? COR_A : 'rgba(0,245,155,0.35)', borderRadius: '4px', height: '100%' }} />}
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'center', minWidth: '84px' }}>{rotulo}</span>
      <div style={{ height: '6px', borderRadius: '4px', background: barras ? 'rgba(255,255,255,0.06)' : 'transparent', overflow: 'hidden' }}>
        {barras && <div style={{ width: largura(valorB), background: bVence ? COR_B : 'rgba(0,229,255,0.35)', borderRadius: '4px', height: '100%' }} />}
      </div>
      <span style={{ ...estiloValor(bVence, COR_B), textAlign: 'right' }}>{textoB ?? valorB}</span>
    </div>
  );
}

const Secao = ({ titulo, children }) => (
  <div style={{ marginTop: '16px' }}>
    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', textAlign: 'center', marginBottom: '6px' }}>
      {titulo}
    </div>
    {children}
  </div>
);

/**
 * Comparação lado a lado de dois atletas: cartas, atributos, números e o confronto
 * direto (jogando juntos e um contra o outro, e a nota que um deu ao outro). Exporta
 * a comparação como imagem: no celular abre o compartilhamento (WhatsApp), no
 * computador baixa o PNG.
 *
 * `elenco` é a lista de /stats (atributos já evoluídos e números do atleta).
 */
export default function CompararAtletas({ elenco = [], inicialA = null, inicialB = null, onClose }) {
  const atletas = useMemo(
    () => [...elenco].filter(p => p && p.id).sort((x, y) => getPrimaryName(x).localeCompare(getPrimaryName(y))),
    [elenco]
  );
  const [idA, setIdA] = useState(() => inicialA ?? (atletas[0] && atletas[0].id) ?? null);
  const [idB, setIdB] = useState(() => {
    if (inicialB) return inicialB;
    const a = atletas.find(p => p.id === (inicialA ?? (atletas[0] && atletas[0].id)));
    const b = maisParecido(atletas, a);
    return b ? b.id : null;
  });
  const [confronto, setConfronto] = useState(null);
  const [exportando, setExportando] = useState(false);
  const area = useRef(null);
  const escala = useEscalaDasCartas();

  const a = atletas.find(p => p.id === Number(idA));
  const b = atletas.find(p => p.id === Number(idB));

  // Confronto direto do par escolhido; respostas de um par anterior são descartadas
  const idDeA = a ? a.id : null;
  const idDeB = b ? b.id : null;
  useEffect(() => {
    setConfronto(null);
    if (!idDeA || !idDeB || idDeA === idDeB) return undefined;
    const controle = new AbortController();
    api(`/compare?a=${idDeA}&b=${idDeB}`, { signal: controle.signal })
      .then(setConfronto)
      .catch(err => {
        if (err.name !== 'AbortError') console.error('Erro ao carregar o confronto direto:', err);
      });
    return () => controle.abort();
  }, [idDeA, idDeB]);

  const trocarLados = () => {
    setIdA(idB);
    setIdB(idA);
  };

  const exportar = async () => {
    if (!area.current || !a || !b) return;
    setExportando(true);
    try {
      await waitForImages(area.current);
      const dataUrl = await toPng(area.current, {
        cacheBust: false,
        pixelRatio: 2,
        backgroundColor: '#08090e',
        filter: (n) => !n.classList?.contains('no-export')
      });
      const nomeArquivo = `comparacao-${paraArquivo(getPrimaryName(a))}-x-${paraArquivo(getPrimaryName(b))}.png`;

      // No celular, compartilhar direto (WhatsApp etc.); onde não dá, baixar o arquivo
      const blob = await (await fetch(dataUrl)).blob();
      const arquivo = typeof File !== 'undefined' ? new File([blob], nomeArquivo, { type: 'image/png' }) : null;
      if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: `${getPrimaryName(a)} x ${getPrimaryName(b)}` });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; // a pessoa fechou o compartilhamento
          // Sem permissão (o toque "expirou" enquanto a imagem era gerada): baixa
        }
      }
      const link = document.createElement('a');
      link.download = nomeArquivo;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao exportar a comparação:', err);
      alert('Não foi possível gerar a imagem da comparação.');
    } finally {
      setExportando(false);
    }
  };

  const seletor = (valor, aoMudar, rotulo, outro) => (
    <select
      className="input"
      aria-label={rotulo}
      value={valor ?? ''}
      onChange={e => aoMudar(Number(e.target.value))}
      style={{ marginBottom: 0, height: '40px', padding: '6px 10px', fontSize: '0.85rem', flex: 1, minWidth: 0 }}
    >
      {atletas.map(p => (
        <option key={p.id} value={p.id} disabled={p.id === outro}>
          {getPrimaryName(p)} · {p.position || 'MEI'} · {calcOVR(p)}
        </option>
      ))}
    </select>
  );

  const golsPorJogo = (p) => (p.matches_count ? p.goals / p.matches_count : 0);
  const nomeA = a ? getPrimaryName(a) : '';
  const nomeB = b ? getPrimaryName(b) : '';
  const notaA = a ? notaDoRanking(a) : null;
  const notaB = b ? notaDoRanking(b) : null;
  const evolA = a ? ovrTrend(a) : 0;
  const evolB = b ? ovrTrend(b) : 0;
  const sinal = (v) => (v > 0 ? `+${v}` : `${v}`);

  return (
    <FundoModal tituloId="comparar-titulo" onClose={onClose} estilo={{ zIndex: 1300, alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '620px', padding: '16px', background: 'rgba(14, 16, 24, 0.98)', margin: 'auto 0' }}>
        {/* Controles (fora da imagem) */}
        <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
          <h3 id="comparar-titulo" className="font-extrabold text-main" style={{ margin: 0, fontSize: '1.05rem' }}>Comparar atletas</h3>
          <button type="button" onClick={onClose} aria-label="Fechar comparação" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
          {seletor(idA, setIdA, 'Primeiro atleta', idB)}
          <button type="button" className="btn btn-secondary" onClick={trocarLados} aria-label="Trocar os lados" title="Trocar os lados" style={{ width: '40px', height: '40px', minHeight: '40px', padding: 0, flexShrink: 0 }}>
            <ArrowLeftRight size={16} />
          </button>
          {seletor(idB, setIdB, 'Segundo atleta', idA)}
        </div>

        {a && b && (
          <>
            {/* Tudo aqui dentro vira a imagem exportada */}
            <div ref={area} style={{ background: '#08090e', borderRadius: '16px', border: '1px solid var(--border)', padding: '16px 12px 12px' }}>
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px' }}>PLUGSHAWTYCAFETOES FC · COMPARAÇÃO</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, marginTop: '2px' }}>
                  <span style={{ color: COR_A }}>{nomeA}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>x</span>
                  <span style={{ color: COR_B }}>{nomeB}</span>
                </div>
              </div>

              <div className="comparacao-cartas">
                <CartaReduzida player={a} escala={escala} id={`comparar-a-${a.id}`} />
                <span style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-muted)' }}>VS</span>
                <CartaReduzida player={b} escala={escala} id={`comparar-b-${b.id}`} />
              </div>

              <Secao titulo="Atributos">
                <LinhaDeDuelo rotulo="OVR" valorA={calcOVR(a)} valorB={calcOVR(b)} />
                {ATRIBUTOS.map(([chave, rotulo]) => (
                  <LinhaDeDuelo key={chave} rotulo={rotulo} valorA={Number(a[chave]) || 0} valorB={Number(b[chave]) || 0} />
                ))}
              </Secao>

              <Secao titulo="Números">
                <LinhaDeDuelo rotulo="Partidas" valorA={a.matches_count || 0} valorB={b.matches_count || 0} barras={false} />
                <LinhaDeDuelo
                  rotulo="Aproveit."
                  valorA={a.win_rate || 0} valorB={b.win_rate || 0}
                  textoA={`${a.win_rate || 0}%`} textoB={`${b.win_rate || 0}%`}
                  maximo={100}
                />
                <LinhaDeDuelo rotulo="Gols" valorA={a.goals || 0} valorB={b.goals || 0} barras={false} />
                <LinhaDeDuelo
                  rotulo="Gols/jogo"
                  valorA={golsPorJogo(a)} valorB={golsPorJogo(b)}
                  textoA={formatarNota(golsPorJogo(a))} textoB={formatarNota(golsPorJogo(b))}
                  barras={false}
                />
                <LinhaDeDuelo rotulo="Assist." valorA={a.assists || 0} valorB={b.assists || 0} barras={false} />
                <LinhaDeDuelo
                  rotulo="Nota"
                  valorA={notaA ?? 0} valorB={notaB ?? 0}
                  textoA={notaA !== null ? formatarNota(notaA) : '-'} textoB={notaB !== null ? formatarNota(notaB) : '-'}
                  maximo={10}
                />
                <LinhaDeDuelo rotulo="Evolução" valorA={evolA} valorB={evolB} textoA={sinal(evolA)} textoB={sinal(evolB)} barras={false} />
              </Secao>

              <Secao titulo="Confronto direto">
                {!confronto ? (
                  <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.78rem' }}>Carregando...</div>
                ) : confronto.jogos_em_comum === 0 ? (
                  <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.78rem' }}>Ainda não jogaram na mesma partida.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                    {confronto.mesmo_time.jogos > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Handshake size={15} color="var(--primary)" />
                        <span>Juntos: <strong>{confronto.mesmo_time.jogos}</strong> jogo(s) ·{' '}
                          <strong style={{ color: COR_A }}>{confronto.mesmo_time.vitorias}V</strong>{' '}
                          {confronto.mesmo_time.empates}E{' '}
                          <strong style={{ color: '#ef4444' }}>{confronto.mesmo_time.derrotas}D</strong>
                        </span>
                      </div>
                    )}
                    {confronto.times_opostos.jogos > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Swords size={15} color="#fbbf24" />
                        <span>Um contra o outro: <strong style={{ color: COR_A }}>{nomeA} {confronto.times_opostos.vitorias_a}</strong>
                          {' x '}<strong style={{ color: COR_B }}>{confronto.times_opostos.vitorias_b} {nomeB}</strong>
                          {confronto.times_opostos.empates > 0 && ` (${confronto.times_opostos.empates} empate${confronto.times_opostos.empates > 1 ? 's' : ''})`}
                        </span>
                      </div>
                    )}
                    {(confronto.notas_entre_eles.a_para_b !== null || confronto.notas_entre_eles.b_para_a !== null) && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                        <Star size={14} color="#fbbf24" />
                        {confronto.notas_entre_eles.a_para_b !== null && <span>{nomeA} deu <strong style={{ color: 'var(--text-main)' }}>{formatarNota(confronto.notas_entre_eles.a_para_b)}</strong> a {nomeB}</span>}
                        {confronto.notas_entre_eles.a_para_b !== null && confronto.notas_entre_eles.b_para_a !== null && <span>·</span>}
                        {confronto.notas_entre_eles.b_para_a !== null && <span>{nomeB} deu <strong style={{ color: 'var(--text-main)' }}>{formatarNota(confronto.notas_entre_eles.b_para_a)}</strong> a {nomeA}</span>}
                      </div>
                    )}
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {confronto.confrontos.slice(0, 5).map(c => {
                        const cor = c.resultado_a === 'V' ? COR_A : c.resultado_a === 'D' ? '#ef4444' : '#fbbf24';
                        return (
                          <li key={c.match_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', fontSize: '0.74rem' }}>
                            <span className="text-muted">{dataCurta(c.date)} · {c.mesmo_time ? (c.adversario ? `juntos vs ${c.adversario}` : 'juntos') : 'um contra o outro'}</span>
                            <span>
                              <strong style={{ color: cor }}>{c.mesmo_time ? c.resultado_a : `${nomeA} ${c.resultado_a}`}</strong> {c.placar}
                              <span className="text-muted"> · gols {c.gols_a} x {c.gols_b}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </Secao>

              <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '0.62rem', fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px' }}>
                PLUGSHAWTYCAFETOES FC · TEMPORADA {ANO} · {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>

            <button
              type="button"
              className="btn w-full"
              onClick={exportar}
              disabled={exportando}
              style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Share2 size={17} /> {exportando ? 'Gerando imagem...' : 'Exportar comparação (imagem)'}
            </button>
          </>
        )}
      </div>
    </FundoModal>
  );
}
