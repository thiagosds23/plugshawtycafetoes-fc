import React, { useState } from 'react';
import { Clipboard, X, Sparkles, Check } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
import { getPrimaryName } from '../../utils/formatters';
import { parseWhatsAppList } from '../../utils/whatsappParser';

export default function WhatsAppImportModal({
  isOpen,
  onClose,
  playersList = [],
  onApply,
  isSubmitting = false
}) {
  const [whatsAppText, setWhatsAppText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);

  if (!isOpen) return null;

  const handleParse = () => {
    const items = parseWhatsAppList(whatsAppText, playersList);
    setParsedItems(items);
  };

  const handleApply = () => {
    if (onApply) {
      onApply(parsedItems.filter(i => i.selected));
    }
  };

  const handleClose = () => {
    setParsedItems([]);
    setWhatsAppText('');
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '540px', padding: '20px 16px', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-extrabold text-lg text-main flex items-center gap-2">
            <Clipboard color="#25D366" size={20} /> Reconhecer Lista do WhatsApp
          </h3>
          <button 
            onClick={handleClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-muted text-xs mb-3">
          Cole a mensagem da lista do futebol. Atletas já cadastrados serão reconhecidos e novos atletas podem ser editados abaixo antes de convocar!
        </p>

        <textarea 
          rows={5}
          className="input"
          placeholder={`futebol sabado 15h arena petropolis:
1. thiago felino
2. Yuri 17cm
3. Rafael
4. elias
5. Hagen
6. Wellington camisa 10
77. CALEBE
8. Flávio Caça Rato
9. Wesley enormossauro
10. Ademilson 52 de panturrilha`}
          value={whatsAppText}
          onChange={e => setWhatsAppText(e.target.value)}
          style={{ marginBottom: '12px', resize: 'vertical', fontSize: '0.85rem' }}
        />

        <button 
          className="btn mb-3" 
          style={{ padding: '10px', fontSize: '0.88rem' }} 
          onClick={handleParse} 
          disabled={!whatsAppText.trim()}
        >
          <Sparkles size={16} /> Identificar Jogadores na Lista
        </button>

        {/* Results Preview */}
        {parsedItems.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '14px', maxHeight: '280px', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px' }}>
            <div className="flex justify-between items-center mb-2 flex-wrap gap-1 px-1">
              <span className="text-xs font-bold text-muted">
                {parsedItems.filter(i => i.selected).length} de {parsedItems.length} selecionados:
              </span>
              {parsedItems.filter(i => i.selected && !i.matchedPlayer).length > 0 && (
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 'bold' }}>
                  ({parsedItems.filter(i => i.selected && !i.matchedPlayer).length} novos serão criados)
                </span>
              )}
            </div>

            {parsedItems.map((item, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: item.matchedPlayer ? 'rgba(0, 245, 155, 0.06)' : 'rgba(251, 191, 36, 0.06)', 
                  borderRadius: '10px', 
                  border: `1px solid ${item.matchedPlayer ? 'rgba(0, 245, 155, 0.25)' : 'rgba(251, 191, 36, 0.3)'}`,
                  padding: '10px 12px',
                  marginBottom: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {/* Linha 1: Checkbox + Texto original */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    checked={item.selected} 
                    onChange={() => {
                      const updated = [...parsedItems];
                      updated[idx].selected = !updated[idx].selected;
                      setParsedItems(updated);
                    }} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: '800', color: 'var(--text-main)', wordBreak: 'break-word', lineHeight: 1.25 }}>
                      {item.originalLine}
                    </div>
                  </div>
                </div>

                {/* Linha 2: Status do Jogador ou Campo de Edição */}
                <div style={{ paddingLeft: '28px' }}>
                  {item.matchedPlayer ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.12)', border: '1px solid rgba(0, 245, 155, 0.3)', padding: '4px 10px', borderRadius: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Check size={13} /> Atleta: {getPrimaryName(item.matchedPlayer.nickname, item.matchedPlayer.username)}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        (OVR {calcOVR(item.matchedPlayer)})
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <span className="badge badge-gold" style={{ fontSize: '0.68rem', padding: '4px 8px', flexShrink: 0 }}>
                        ✨ Novo
                      </span>
                      <input 
                        type="text" 
                        className="input" 
                        value={item.suggestedName}
                        onChange={(e) => {
                          const updated = [...parsedItems];
                          updated[idx].suggestedName = e.target.value;
                          setParsedItems(updated);
                        }}
                        placeholder="Nome para o cadastro e carta FUT"
                        style={{ 
                          flex: 1, 
                          padding: '6px 10px', 
                          fontSize: '0.82rem', 
                          height: '32px', 
                          marginBottom: 0, 
                          borderRadius: '8px',
                          border: '1px solid rgba(251, 191, 36, 0.4)'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button 
            className="btn flex-1" 
            onClick={handleApply} 
            disabled={isSubmitting || parsedItems.filter(i => i.selected).length === 0}
          >
            {isSubmitting 
              ? 'Cadastrando & Convocando...' 
              : `Confirmar Convocação (${parsedItems.filter(i => i.selected).length} Atletas)`}
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ width: 'auto' }} 
            onClick={handleClose} 
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
