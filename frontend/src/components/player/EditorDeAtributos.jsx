import React, { useState } from 'react';
import { Sliders, RotateCcw, Check } from 'lucide-react';
import { calcOVR, ajustarParaOVR } from '../../utils/ovr';
import { api } from '../../utils/api';

const ATRIBUTOS = [
  ['pace', 'PAC', 'Ritmo'],
  ['shooting', 'SHO', 'Chute'],
  ['passing', 'PAS', 'Passe'],
  ['dribbling', 'DRI', 'Drible'],
  ['defending', 'DEF', 'Defesa'],
  ['physical', 'PHY', 'Físico']
];

const valoresDaCarta = (p) => Object.fromEntries(ATRIBUTOS.map(([k]) => [k, Number(p[k]) || 50]));
const limitar = (v) => Math.max(1, Math.min(99, Math.round(Number(v) || 0)));
const corDoValor = (v) => (v >= 80 ? '#ffd700' : v >= 70 ? 'var(--primary)' : v >= 60 ? 'var(--cyan)' : 'var(--text-main)');

/**
 * Editor dos atributos da carta, só para o administrador. Os valores são os que
 * aparecem NA CARTA; o servidor desconta a evolução pelos jogos e grava a base, então
 * a evolução continua valendo por cima. O campo de OVR ajusta os seis atributos juntos
 * até a carta ter aquele OVR na posição do atleta.
 */
export default function EditorDeAtributos({ player, position, user, onSalvo }) {
  const posicao = position || player.position || 'MEI';
  const [valores, setValores] = useState(() => valoresDaCarta(player));
  const [ovrDigitado, setOvrDigitado] = useState(null); // texto do campo enquanto digita
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'ok' | 'erro', texto }

  const originais = valoresDaCarta(player);
  const ovr = calcOVR({ ...valores, position: posicao });
  const mudou = ATRIBUTOS.some(([k]) => valores[k] !== originais[k]);
  const evolucao = (k) => (player.form && Number(player.form[k])) || 0;

  const mudarAtributo = (k, v) => {
    setAviso(null);
    setValores(prev => ({ ...prev, [k]: limitar(v) }));
  };

  const aplicarOVR = (texto) => {
    setOvrDigitado(texto);
    const alvo = Number(texto);
    if (!Number.isInteger(alvo) || alvo < 25 || alvo > 99) return;
    setAviso(null);
    setValores(prev => ajustarParaOVR(prev, alvo, posicao));
  };

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const atualizado = await api(`/users/${player.id}/attributes`, { method: 'PUT', body: { valores }, user });
      setValores(valoresDaCarta(atualizado));
      setAviso({ tipo: 'ok', texto: `Atributos salvos. OVR ${calcOVR({ ...atualizado, position: posicao })}.` });
      if (onSalvo) onSalvo(atualizado);
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--primary-glow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
        <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sliders size={14} color="var(--primary)" /> Atributos da carta (admin)
        </h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.1)', padding: '4px 10px', borderRadius: '10px', border: '1px solid var(--primary-glow)' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>OVR {posicao}:</span>
          <input
            type="number"
            min="25"
            max="99"
            inputMode="numeric"
            aria-label="OVR desejado"
            title="Digite o OVR desejado: os seis atributos se ajustam juntos"
            value={ovrDigitado ?? ovr}
            onChange={e => aplicarOVR(e.target.value)}
            onBlur={() => setOvrDigitado(null)}
            style={{ width: '52px', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--primary-glow)', borderRadius: '8px', color: 'var(--primary)', fontWeight: 900, fontSize: '0.95rem', textAlign: 'center', padding: '2px 4px' }}
          />
        </label>
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
        Os valores são os da carta. Mude o OVR para ajustar tudo junto, ou cada atributo. A evolução pelos jogos continua valendo por cima.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ATRIBUTOS.map(([k, sigla, nome]) => {
          const ev = evolucao(k);
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 52px', alignItems: 'center', gap: '10px' }}>
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 900, color: 'var(--text-main)' }}>{sigla}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{nome}</div>
              </div>
              <div>
                <input
                  type="range"
                  min="1"
                  max="99"
                  value={valores[k]}
                  aria-label={`${nome} (${sigla})`}
                  onChange={e => mudarAtributo(k, e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  base {Math.max(1, Math.min(99, valores[k] - ev))}
                  {ev !== 0 && <> · evolução <span style={{ color: ev > 0 ? 'var(--primary)' : '#ef4444' }}>{ev > 0 ? `+${ev}` : ev}</span></>}
                </div>
              </div>
              <input
                type="number"
                min="1"
                max="99"
                inputMode="numeric"
                aria-label={`Valor de ${nome}`}
                value={valores[k]}
                onChange={e => mudarAtributo(k, e.target.value)}
                style={{ width: '52px', background: 'rgba(14, 16, 23, 0.7)', border: '1px solid var(--border)', borderRadius: '10px', color: corDoValor(valores[k]), fontWeight: 900, fontSize: '1rem', textAlign: 'center', padding: '6px 2px' }}
              />
            </div>
          );
        })}
      </div>

      {aviso && (
        <div role="status" style={{ marginTop: '12px', fontSize: '0.76rem', fontWeight: 700, color: aviso.tipo === 'ok' ? 'var(--primary)' : '#ef4444' }}>
          {aviso.texto}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => { setValores(originais); setAviso(null); }}
          disabled={!mudou || salvando}
          style={{ flex: '0 0 auto', padding: '8px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RotateCcw size={14} /> Desfazer
        </button>
        <button
          type="button"
          className="btn"
          onClick={salvar}
          disabled={!mudou || salvando}
          style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Check size={15} /> {salvando ? 'Salvando...' : 'Salvar atributos'}
        </button>
      </div>
    </div>
  );
}
