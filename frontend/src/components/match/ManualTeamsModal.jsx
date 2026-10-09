import React, { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { X, Users, Save } from 'lucide-react';
import { calcOVR, calcTeamOVR } from '../../utils/ovr';
import { getPrimaryName } from '../../utils/formatters';
import FundoModal from './FundoModal';

const TIMES = [
  { key: 'A', name: 'COM COLETE', curto: 'COM', cor: '#00f59b', fundo: 'rgba(0, 245, 155, 0.12)', borda: 'rgba(0, 245, 155, 0.4)' },
  { key: 'B', name: 'SEM COLETE', curto: 'SEM', cor: '#ffffff', fundo: 'rgba(255, 255, 255, 0.1)', borda: 'rgba(255, 255, 255, 0.4)' }
];

/**
 * Montagem dos times à mão, sem sorteio. Cada convocado vai para COM COLETE ou
 * SEM COLETE, e a média de OVR de cada lado aparece enquanto os times são montados.
 * Só salva quando todos os convocados têm time e nenhum dos dois lados está vazio.
 */
export default function ManualTeamsModal({ players = [], onClose, onSave, isSaving = false }) {
  const tituloId = useId();
  // id do atleta -> 'A' | 'B'
  const [lado, setLado] = useState({});

  // Do maior OVR para o menor, para facilitar equilibrar os times de olho
  const ordenados = [...players].sort((a, b) => calcOVR(b) - calcOVR(a));
  const doTime = (key) => ordenados.filter(p => lado[p.id] === key);
  const timeA = doTime('A');
  const timeB = doTime('B');
  const faltam = ordenados.length - timeA.length - timeB.length;
  const podeSalvar = faltam === 0 && timeA.length > 0 && timeB.length > 0 && !isSaving;

  const escolher = (playerId, key) => setLado(prev => ({ ...prev, [playerId]: key }));

  return (
    <FundoModal tituloId={tituloId} onClose={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-card"
        style={{ width: '100%', maxWidth: '520px', maxHeight: '88vh', padding: '22px 18px', background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 id={tituloId} className="font-extrabold text-main flex items-center gap-2" style={{ margin: 0 }}>
            <Users color="var(--primary)" size={20} /> Montar Times Manualmente
          </h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} title="Fechar" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Resumo dos dois lados */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          {TIMES.map(time => {
            const lista = time.key === 'A' ? timeA : timeB;
            return (
              <div key={time.key} style={{ padding: '10px 12px', borderRadius: '12px', border: `1px solid ${time.borda}`, background: time.fundo, textAlign: 'center' }}>
                <div className="font-extrabold" style={{ color: time.cor, fontSize: '0.88rem' }}>{time.name}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {lista.length} atleta(s) • OVR {calcTeamOVR(lista)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Um botão de cada time por atleta */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {ordenados.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="font-extrabold text-main" style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getPrimaryName(p)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {p.position || 'MEI'} • OVR {calcOVR(p)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {TIMES.map(time => {
                  const ativo = lado[p.id] === time.key;
                  return (
                    <button
                      key={time.key}
                      type="button"
                      onClick={() => escolher(p.id, time.key)}
                      title={`Colocar em ${time.name}`}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '9px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        border: `1px solid ${ativo ? time.cor : 'var(--border)'}`,
                        background: ativo ? time.cor : 'transparent',
                        color: ativo ? '#07080c' : 'var(--text-muted)'
                      }}
                    >
                      {time.curto}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '0.78rem', color: faltam > 0 ? '#fbbf24' : 'var(--text-muted)', textAlign: 'center', margin: '12px 0 10px' }}>
          {faltam > 0
            ? `Falta escolher o time de ${faltam} atleta(s).`
            : `Diferença de OVR entre os times: ${Math.abs(calcTeamOVR(timeA) - calcTeamOVR(timeB))}`}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="btn"
            disabled={!podeSalvar}
            onClick={() => onSave(timeA.map(p => p.id), timeB.map(p => p.id))}
            style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Times'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </FundoModal>
  );
}
