import React from 'react';
import { calcBaseOVR, ovrTrend } from '../utils/ovr';

const formatarNota = (valor) => Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Explica em uma linha por que a carta subiu ou caiu.
 *
 * A evolução compara cada atuação com o esperado para o nível do atleta, então uma
 * nota 7 pode derrubar a carta de um 81 e subir a de um 60. Sem essa explicação,
 * "tirei 7 e minha carta caiu" parece erro.
 */
export default function ResumoForma({ atleta }) {
  if (!atleta || !atleta.form) return null;

  const { partidas, nota, nota_esperada: notaEsperada } = atleta.form;
  const variacao = ovrTrend(atleta);
  const ovrBase = calcBaseOVR(atleta);

  // Finalização ou passe acima do resto indica bônus por participação nos gols do time
  const teveBonusOfensivo = (atleta.form.shooting > atleta.form.pace) || (atleta.form.passing > atleta.form.pace);

  let motivo;
  if (nota === null || nota === undefined) {
    motivo = 'as notas das partidas ainda estão em votação';
  } else if (nota > notaEsperada + 0.2) {
    motivo = `nota ${formatarNota(nota)}, acima do esperado para OVR ${ovrBase} (${formatarNota(notaEsperada)})`;
  } else if (nota < notaEsperada - 0.2) {
    motivo = `nota ${formatarNota(nota)}, abaixo do esperado para OVR ${ovrBase} (${formatarNota(notaEsperada)})`;
  } else {
    motivo = `nota ${formatarNota(nota)}, dentro do esperado para OVR ${ovrBase}`;
  }
  if (teveBonusOfensivo) motivo += ', com participação acima do esperado nos gols';

  const cor = variacao > 0 ? 'var(--primary)' : variacao < 0 ? '#ef4444' : 'var(--text-muted)';
  const destaque = variacao > 0 ? `▲ +${variacao} OVR` : variacao < 0 ? `▼ ${variacao} OVR` : 'OVR estável';

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
      <span style={{ color: cor, fontWeight: 900, marginRight: '6px' }}>{destaque}</span>
      pelo desempenho: {motivo} · {partidas} {partidas === 1 ? 'partida' : 'partidas'}
    </div>
  );
}
