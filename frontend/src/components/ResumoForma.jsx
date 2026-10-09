import React from 'react';
import { calcBaseOVR, ovrTrend } from '../utils/ovr';
import { formatarNota } from '../utils/formatters';

const sinal = (v) => (v > 0 ? `+${formatarNota(v)}` : formatarNota(v));
const corDe = (v) => (v > 0.05 ? 'var(--primary)' : v < -0.05 ? '#ef4444' : 'var(--text-muted)');

/**
 * Explica por que a carta subiu ou caiu, sinal por sinal.
 *
 * A evolução compara cada partida com o esperado para o atleta e para o time, então
 * uma nota 7 pode derrubar a carta de um 81 e subir a de um 60, e uma vitória sobre um
 * time mais forte vale mais do que sobre um mais fraco. Sem essa explicação, "tirei 7 e
 * minha carta caiu" parece erro. Os pontos de cada sinal vêm prontos do servidor
 * (form.componentes) e são os mesmos que movem os atributos.
 */
export default function ResumoForma({ atleta }) {
  if (!atleta || !atleta.form) return null;

  const form = atleta.form;
  const variacao = ovrTrend(atleta);
  const ovrBase = calcBaseOVR(atleta);
  const comp = form.componentes || {};
  const partidas = form.partidas || 0;

  const itens = [];

  if (comp.resultado !== undefined) {
    const v = form.vitorias ?? 0, e = form.empates ?? 0, d = form.derrotas ?? 0;
    itens.push({
      rotulo: 'Resultados',
      pontos: comp.resultado,
      detalhe: `${v}V ${e}E ${d}D, pesando a força dos times e o saldo de gols`
    });
  }

  if (form.nota !== null && form.nota !== undefined) {
    const n = form.nota, esperada = form.nota_esperada;
    const comparacao = n > esperada + 0.2 ? 'acima' : n < esperada - 0.2 ? 'abaixo' : 'dentro';
    itens.push({
      rotulo: 'Notas',
      pontos: comp.nota ?? 0,
      detalhe: `${formatarNota(n)} em ${form.jogos_avaliados ?? partidas} jogo(s), ${comparacao} do esperado para OVR ${ovrBase} (${formatarNota(esperada)})`
    });
  } else {
    itens.push({ rotulo: 'Notas', pontos: 0, detalhe: 'sem notas fechadas ainda (votação em andamento ou sem votos)' });
  }

  const gols = comp.gols ?? form.bonus_gol;
  if (gols !== undefined && Math.abs(gols) >= 0.1) {
    itens.push({
      rotulo: 'Gols',
      pontos: gols,
      detalhe: gols > 0 ? 'participa de mais gols do time do que o esperado para a posição' : 'abaixo da participação esperada nos gols'
    });
  }

  const assist = comp.assistencias ?? form.bonus_assist;
  if (assist !== undefined && Math.abs(assist) >= 0.1) {
    itens.push({
      rotulo: 'Assistências',
      pontos: assist,
      detalhe: assist > 0 ? 'serve mais do que o esperado para a posição' : 'abaixo das assistências esperadas para a posição'
    });
  }

  if (comp.assiduidade > 0) {
    itens.push({
      rotulo: 'Assiduidade',
      pontos: comp.assiduidade,
      detalhe: `${form.jogos_recentes} jogo(s) nos últimos 45 dias (só no físico)`
    });
  }

  const cor = variacao > 0 ? 'var(--primary)' : variacao < 0 ? '#ef4444' : 'var(--text-muted)';
  const destaque = variacao > 0 ? `▲ +${variacao} OVR` : variacao < 0 ? `▼ ${variacao} OVR` : 'OVR estável';
  const confianca = form.confianca !== undefined && form.confianca < 0.95
    ? ` · peso ${Math.round(form.confianca * 100)}% (poucos jogos recentes)`
    : '';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${variacao === 0 ? 'var(--border)' : cor}`,
        borderRadius: '10px',
        padding: '9px 12px',
        marginBottom: '10px',
        fontSize: '0.74rem',
        lineHeight: 1.4,
        color: 'var(--text-muted)'
      }}
    >
      <div>
        <span style={{ color: cor, fontWeight: 900, marginRight: '6px' }}>{destaque}</span>
        pelo desempenho em {partidas} {partidas === 1 ? 'partida' : 'partidas'}{confianca}
      </div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {itens.map(item => (
          <li key={item.rotulo} style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ color: corDe(item.pontos), fontWeight: 800, minWidth: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {sinal(item.pontos)}
            </span>
            <span>
              <strong style={{ color: 'var(--text-main)', fontWeight: 700 }}>{item.rotulo}</strong>: {item.detalhe}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
