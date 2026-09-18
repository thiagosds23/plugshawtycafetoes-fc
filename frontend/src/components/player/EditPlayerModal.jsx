import React, { useState, useEffect, useContext } from 'react';
import { Edit2, X, Camera, UserCircle, Sliders, Trash2, Plus, User, UserCheck, Tag, Phone, Mail, Lock, ShieldCheck, ShieldAlert, Shield, Info, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { calcOVR } from '../../utils/ovr';
import { formatHeight } from '../../utils/formatters';
import { API_URL, formatPhotoUrl } from '../../config';
import { AuthContext } from '../../AuthContext';

export default function EditPlayerModal({
  player,
  editForm,
  setEditForm,
  onClose,
  onSave,
  onDeletePlayer,
  onOpenAdjustPhoto,
  onSelectNewPhoto,
  onDeletePhoto,
  isAdmin
}) {
  const overall = calcOVR({ ...player, position: editForm.position });
  const [newNickInput, setNewNickInput] = useState('');

  const currentNicknames = (editForm.nickname || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

  const handleAddNickname = () => {
    if (!newNickInput.trim()) return;
    const cleaned = newNickInput.trim().replace(/,/g, '');
    if (!currentNicknames.some(n => n.toLowerCase() === cleaned.toLowerCase())) {
      const updated = [...currentNicknames, cleaned];
      setEditForm({ ...editForm, nickname: updated.join(', ') });
    }
    setNewNickInput('');
  };

  const handleRemoveNickname = (indexToRemove) => {
    const updated = currentNicknames.filter((_, idx) => idx !== indexToRemove);
    setEditForm({ ...editForm, nickname: updated.join(', ') });
  };

  const { user } = useContext(AuthContext);
  const [pinVal, setPinVal] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState('');
  const [hasPinState, setHasPinState] = useState(Boolean(player?.has_pin || (user?.id === player?.id && user?.has_pin)));

  useEffect(() => {
    setHasPinState(Boolean(player?.has_pin || (user?.id === player?.id && user?.has_pin)));
  }, [player?.has_pin, player?.id, user?.has_pin, user?.id]);

  const handleSavePin = async (val) => {
    setIsSavingPin(true);
    setPinFeedback('');
    try {
      const res = await fetch(`${API_URL}/users/${player.id}/pin`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': String(player.id)
        },
        body: JSON.stringify({ pin: val })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar PIN');
      setHasPinState(data.has_pin);
      player.has_pin = data.has_pin;
      if (user && user.id === player.id) {
        user.has_pin = data.has_pin;
      }
      setPinFeedback(val ? '✅ PIN atualizado!' : '✅ PIN removido! Acesso livre.');
      setPinVal('');
      setTimeout(() => setPinFeedback(''), 3500);
    } catch (err) {
      setPinFeedback(`❌ ${err.message}`);
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card" style={{ width: '580px', maxWidth: '96vw', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', background: 'rgba(18, 20, 32, 0.98)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(0,245,155,0.12)', overflow: 'hidden', padding: 0 }}>
        
        {/* Header com indicador de OVR e Botão Fechar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(0,245,155,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--primary)', boxShadow: 'var(--glow)' }}>
              <Edit2 size={20} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 className="font-extrabold text-lg text-main" style={{ margin: 0 }}>
                  {editForm.username || player.username}
                </h3>
                {currentNicknames.length > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--primary)', fontWeight: '800' }}>
                    ({currentNicknames.join(', ')})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span className="font-bold text-primary">{editForm.position || 'MEI'}</span>
                <span>•</span>
                <span className="font-bold text-yellow-400">OVR {overall}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Fechar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Conteúdo Rolável */}
        <div style={{ padding: '20px 20px 30px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Seção Foto da Carta FUT */}
          <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: '800', fontSize: '0.75rem', marginBottom: '16px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={14} color="var(--primary)" /> Foto da Carta FUT
              </span>
              {player.photo ? (
                <span style={{ fontSize: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Foto Ativa</span>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>Silhueta Padrão</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              <div style={{ 
                width: '100px', 
                height: '100px', 
                borderRadius: '16px', 
                background: '#0a0a0f', 
                overflow: 'hidden', 
                border: '2px solid var(--primary)', 
                boxShadow: '0 0 16px rgba(0, 245, 155, 0.25)', 
                flexShrink: 0, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                position: 'relative'
              }}>
                {player.photo ? (
                  <img src={formatPhotoUrl(player.photo)} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserCircle size={56} color="rgba(255,255,255,0.3)" />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {player.photo ? (
                  <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={onOpenAdjustPhoto}
                        style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 800, flex: 1, color: 'var(--primary)', borderColor: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                      >
                        <Sliders size={14} /> Ajustar
                      </button>

                      <label className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 800, flex: 1, cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', borderRadius: '10px' }}>
                        <Camera size={14} /> Trocar
                        <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                      </label>
                    </div>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={onDeletePhoto}
                      style={{ padding: '7px 12px', fontSize: '0.74rem', width: '100%', color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    >
                      <Trash2 size={14} /> Deletar Foto
                    </button>
                  </>
                ) : (
                  <label className="btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', margin: 0, borderRadius: '10px' }}>
                    <Plus size={16} /> Adicionar Foto
                    <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Dados Pessoais & Posição */}
          <div style={{ marginBottom: '10px' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} color="var(--primary)" /> Dados Pessoais & Posição
            </h4>
            
            <div style={{ marginBottom: '12px' }}>
              <label className="label text-xs font-bold" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <UserCheck size={14} color="var(--primary)" /> Nome Oficial
              </label>
              <input 
                type="text" 
                className="input" 
                style={{ marginBottom: 0, padding: '10px 14px', fontSize: '0.9rem' }} 
                placeholder="Ex: Thiago Silva" 
                value={editForm.username || ''} 
                onChange={e => setEditForm({ ...editForm, username: e.target.value })} 
                required 
              />
            </div>

            {/* Gerenciador de Múltiplos Apelidos */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="label text-xs" style={{ margin: 0, fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={13} color="var(--primary)" /> Apelidos de Jogo ({currentNicknames.length})
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Pressione Enter ou Vírgula para adicionar
                </span>
              </div>

              {currentNicknames.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {currentNicknames.map((nick, idx) => (
                    <span 
                      key={idx} 
                      style={{ 
                        background: 'rgba(0, 245, 155, 0.12)', 
                        border: '1px solid rgba(0, 245, 155, 0.35)', 
                        borderRadius: '16px', 
                        padding: '4px 10px', 
                        fontSize: '0.8rem', 
                        fontWeight: '800', 
                        color: 'var(--primary)', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px' 
                      }}
                    >
                      {nick} {idx === 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>(Principal)</span>}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveNickname(idx)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 0, fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                        title="Remover este apelido"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Nenhum apelido cadastrado. Adicione apelidos para o sistema reconhecer na convocação!
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }} 
                  placeholder="Ex: Fela" 
                  value={newNickInput} 
                  onChange={e => setNewNickInput(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddNickname();
                    }
                  }}
                />
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: 'auto', padding: '0 16px', fontSize: '0.82rem' }}
                  onClick={handleAddNickname}
                >
                  + Adicionar
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="label text-xs">Posição de Jogo</label>
                <select 
                  className="input" 
                  style={{ marginBottom: 0, height: '40px', padding: '6px 12px' }} 
                  value={editForm.position} 
                  onChange={e => setEditForm({...editForm, position: e.target.value})}
                >
                  <option value="ATA">ATA - Atacante / Pivô</option>
                  <option value="MEI">MEI - Meio-Campista / Ala</option>
                  <option value="VOL">VOL - Volante / Fixo</option>
                  <option value="ZAG">ZAG - Zagueiro / Defensor</option>
                  <option value="LAT">LAT - Lateral / Ala</option>
                  <option value="GOL">GOL - Goleiro</option>
                </select>
              </div>

              <div>
                <label className="label text-xs">Altura (m)</label>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0, padding: '8px 12px' }} 
                  placeholder="Ex: 1.78, 1,78 ou 178" 
                  value={editForm.height} 
                  onChange={e => setEditForm({...editForm, height: e.target.value})} 
                  onBlur={e => setEditForm({...editForm, height: formatHeight(e.target.value)})}
                />
              </div>
              <div>
                <label className="label text-xs">Peso (kg)</label>
                <input type="text" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="Ex: 75" value={editForm.weight} onChange={e => setEditForm({...editForm, weight: e.target.value})} />
              </div>

              <div>
                <label className="label text-xs" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Phone size={12} color="var(--primary)" /> Telefone
                </label>
                <input type="text" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="54999999999" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="label text-xs" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Mail size={12} color="var(--primary)" /> E-mail de Login
                </label>
                <input type="email" className="input" style={{ marginBottom: 0, padding: '8px 12px', width: '100%' }} placeholder="seu@email.com" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
              </div>
            </div>
          </div>

          {/* Senha / PIN de Segurança */}
          <div style={{ padding: '14px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="var(--primary)" /> Senha / PIN de Segurança
              </h4>
              <span className={hasPinState ? 'badge badge-volt' : 'badge'} style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {hasPinState ? <><ShieldCheck size={12} /> Protegido com PIN</> : <><ShieldAlert size={12} /> Sem Senha (Livre)</>}
              </span>
            </div>

            {pinFeedback && (
              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px', color: pinFeedback.startsWith('✅') ? 'var(--primary)' : '#ff3366' }}>
                {pinFeedback}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="password"
                maxLength={6}
                className="input"
                placeholder={hasPinState ? "Novo PIN (4 dígitos)" : "Criar PIN (4 dígitos)"}
                value={pinVal}
                onChange={e => setPinVal(e.target.value)}
                style={{ flex: '1 1 140px', padding: '7px 12px', fontSize: '0.82rem', height: '36px', marginBottom: 0, borderRadius: '8px' }}
              />
              <button 
                type="button" 
                className="btn" 
                style={{ padding: '7px 14px', fontSize: '0.78rem', height: '36px', width: 'auto', borderRadius: '8px' }}
                onClick={() => handleSavePin(pinVal)}
                disabled={isSavingPin || !pinVal.trim()}
              >
                {isSavingPin ? 'Salvando...' : (hasPinState ? 'Alterar PIN' : 'Definir PIN')}
              </button>
              {hasPinState && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '7px 12px', fontSize: '0.75rem', height: '36px', width: 'auto', borderRadius: '8px', color: '#ff3366' }}
                  onClick={() => { if (confirm('Deseja remover o PIN? Qualquer pessoa poderá acessar com seu nome.')) handleSavePin(null); }}
                  disabled={isSavingPin}
                >
                  Remover PIN
                </button>
              )}
            </div>
          </div>

          {/* Atributos Oficiais da Carta FUT (Somente Leitura) */}
          <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} color="var(--primary)" /> Estatísticas Oficiais do Atleta
                </h4>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={12} color="var(--text-muted)" /> Definidas pelas avaliações do elenco e planilha oficial
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.1)', padding: '4px 10px', borderRadius: '10px', border: '1px solid var(--primary-glow)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>OVR {editForm.position || 'MEI'}:</span>
                <span style={{ fontSize: '0.92rem', fontWeight: '900', color: 'var(--primary)' }}>{overall}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
              {[
                { label: 'PAC (Ritmo)', val: player.pace || 50 },
                { label: 'SHO (Chute)', val: player.shooting || 50 },
                { label: 'PAS (Passe)', val: player.passing || 50 },
                { label: 'DRI (Drible)', val: player.dribbling || 50 },
                { label: 'DEF (Defesa)', val: player.defending || 50 },
                { label: 'PHY (Físico)', val: player.physical || 50 }
              ].map((stat, i) => (
                <div 
                  key={i} 
                  style={{ 
                    background: 'rgba(14, 16, 23, 0.7)', 
                    padding: '8px 4px', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)' 
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>{stat.label}</div>
                  <div style={{ 
                    fontSize: '1.05rem', 
                    fontWeight: 900, 
                    color: stat.val >= 80 ? '#ffd700' : stat.val >= 70 ? 'var(--primary)' : stat.val >= 60 ? 'var(--cyan)' : 'var(--text-main)' 
                  }}>
                    {stat.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Rodapé Fixo */}
        <div className="modal-bottom-bar">
          <button className="btn btn-save-main" onClick={onSave}>
            <Check size={18} /> Salvar Alterações
          </button>

          <div className="secondary-group">
            <button className="btn btn-secondary" onClick={onClose}>
              <X size={16} /> Cancelar
            </button>
            {isAdmin && (
              <button type="button" onClick={onDeletePlayer} className="btn btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
                <Trash2 size={16} /> Excluir Jogador
              </button>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
