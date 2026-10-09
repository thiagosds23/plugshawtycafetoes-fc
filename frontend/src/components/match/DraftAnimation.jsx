import React, { useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Sparkles, RefreshCw, Shield } from 'lucide-react';
import { calcOVR, calcTeamOVR } from '../../utils/ovr';
import { getPrimaryName } from '../../utils/formatters';
import { playDraftSound, playCelebrationSound } from '../../utils/soundEffects';
import { useEscapeKey } from '../../utils/useEscapeKey';

// Cores de cada lado do sorteio
const TEMAS = {
  A: {
    nome: 'COM COLETE',
    cor: '#00f59b',
    caixa: { background: 'rgba(0, 245, 155, 0.05)', border: '1.5px solid rgba(0, 245, 155, 0.35)' },
    selo: { className: 'badge badge-volt', style: { fontSize: '0.8rem' } },
    linha: { background: 'rgba(0, 245, 155, 0.08)', border: '1px solid rgba(0, 245, 155, 0.2)' },
    posicao: { background: 'rgba(0, 245, 155, 0.2)', color: '#00f59b' }
  },
  B: {
    nome: 'SEM COLETE',
    cor: '#ffffff',
    caixa: { background: 'rgba(255, 255, 255, 0.03)', border: '1.5px solid rgba(255, 255, 255, 0.25)' },
    selo: { className: 'badge', style: { fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)' } },
    linha: { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.15)' },
    posicao: { background: 'rgba(255, 255, 255, 0.15)', color: '#fff' }
  }
};

/** Coluna de um dos times, recebendo os atletas conforme são sorteados. */
function ColunaDoSorteio({ tema, atletas }) {
  return (
    <div style={{ ...tema.caixa, borderRadius: '18px', padding: '16px' }}>
      <div className="flex justify-between items-center mb-3">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: tema.cor, fontWeight: 900, fontSize: '1rem' }}>
          <Shield size={18} /> {tema.nome}
        </div>
        <span className={tema.selo.className} style={tema.selo.style}>
          OVR Médio: {atletas.length > 0 ? calcTeamOVR(atletas) : '-'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {atletas.map((p) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0.6, y: -10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', ...tema.linha, borderRadius: '10px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.70rem', fontWeight: 800, padding: '2px 6px', borderRadius: '5px', ...tema.posicao }}>
                {p.position || 'MEI'}
              </span>
              <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#fff' }}>
                {getPrimaryName(p.nickname, p.username)}
              </span>
            </div>
            <span style={{ fontWeight: 900, fontSize: '0.90rem', color: '#fbbf24' }}>
              {calcOVR(p)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/**
 * Sorteio cinemático. Os efeitos sonoros tocam só aqui, conforme o estágio: quem
 * dispara o sorteio não toca som nenhum (antes cada bipe saía duas vezes).
 */
const umaCasa = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Números do sorteio: equilíbrio entre os times e quanto ele variou do último racha. */
function ResumoDoSorteio({ resumo }) {
  const itens = [
    `OVR médio ${umaCasa(resumo.ovrMedioA)} x ${umaCasa(resumo.ovrMedioB)}`
  ];
  if (resumo.duplasRepetidas !== null && resumo.duplasRepetidas !== undefined) {
    itens.push(resumo.duplasRepetidas === 0
      ? 'nenhuma dupla repetida do último racha'
      : `${resumo.duplasRepetidas} dupla(s) repetida(s) do último racha`);
  }
  if (resumo.opcoesEquilibradas > 1) {
    itens.push(`sorteado entre ${resumo.opcoesEquilibradas} divisões equilibradas`);
  }
  return (
    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 16px', lineHeight: 1.5 }}>
      {itens.join(' · ')}
    </p>
  );
}

export default function DraftAnimation({ draftAnim, onClose }) {
  const tituloId = useId();
  const estagio = draftAnim?.stage;
  const quantosRevelados = (draftAnim?.teamA?.length || 0) + (draftAnim?.teamB?.length || 0);

  useEffect(() => {
    if (estagio === 'revealing') {
      playDraftSound(440 + quantosRevelados * 25);
    } else if (estagio === 'done') {
      playCelebrationSound();
    }
  }, [estagio, quantosRevelados]);

  // Esc só fecha com os times prontos: no meio do sorteio a gravação ainda está em andamento
  useEscapeKey(onClose, estagio === 'done');

  // O AnimatePresence precisa estar sempre montado para animar a saída: com um
  // "return null" antes dele, o overlay sumia de uma vez
  return (
    <AnimatePresence>
      {draftAnim && (
        <motion.div
          key="sorteio"
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 7, 14, 0.94)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          {draftAnim.stage === 'shuffling' && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              style={{ textAlign: 'center', maxWidth: '480px' }}
            >
              <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 28px' }}>
                <div
                  className="radar-spinner"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    border: '3px dashed #00f59b',
                    boxShadow: '0 0 30px rgba(0, 245, 155, 0.4)'
                  }}
                />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Shuffle size={48} color="#00f59b" />
                </div>
              </div>

              <h2 id={tituloId} style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Sparkles size={24} color="#00f59b" /> BALANCEANDO EQUIPES...
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
                Testando todas as divisões dos <strong style={{ color: '#00f59b' }}>{draftAnim.total} atletas convocados</strong>: força equilibrada pelo OVR atual, posições divididas e duplas diferentes dos últimos rachas.
              </p>
            </motion.div>
          )}

          {(draftAnim.stage === 'revealing' || draftAnim.stage === 'done') && (
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass-card"
              style={{
                width: '100%',
                maxWidth: '860px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '22px 18px',
                borderRadius: '24px',
                background: 'rgba(12, 16, 26, 0.96)',
                border: draftAnim.stage === 'done' ? '1px solid rgba(0, 245, 155, 0.5)' : '1px solid var(--border)',
                boxShadow: draftAnim.stage === 'done' ? '0 0 50px rgba(0, 245, 155, 0.25)' : '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              {/* Header Status */}
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '20px', background: draftAnim.stage === 'done' ? 'rgba(0, 245, 155, 0.15)' : 'rgba(255, 255, 255, 0.08)', color: draftAnim.stage === 'done' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  {draftAnim.stage === 'done' ? <><Sparkles size={16} /> SORTEIO FINALIZADO COM SUCESSO</> : <><RefreshCw size={16} className="radar-spinner" /> SORTEIO ({draftAnim.revealedCount} / {draftAnim.total})</>}
                </div>
                <h3 id={tituloId} style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  {draftAnim.stage === 'done' ? <><Sparkles size={22} color="var(--primary)" /> Times Prontos para o Jogo!</> : 'Revelando os times...'}
                </h3>
              </div>

              {/* Two Teams Side-by-Side (or stacked on mobile) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <ColunaDoSorteio tema={TEMAS.A} atletas={draftAnim.teamA} />
                <ColunaDoSorteio tema={TEMAS.B} atletas={draftAnim.teamB} />
              </div>

              {/* Por que esses times: equilíbrio e quanto mudou em relação ao último racha */}
              {draftAnim.stage === 'done' && draftAnim.resumo && (
                <ResumoDoSorteio resumo={draftAnim.resumo} />
              )}

              {/* Action Button */}
              {draftAnim.stage === 'done' && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ textAlign: 'center' }}
                >
                  <button
                    className="btn"
                    style={{ width: '100%', maxWidth: '380px', padding: '14px 28px', fontSize: '1rem', fontWeight: 900, margin: '0 auto', boxShadow: '0 8px 30px rgba(0, 245, 155, 0.45)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={onClose}
                  >
                    <Sparkles size={18} /> Ver Escalação Completa no Campo
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
