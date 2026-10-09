import React, { useState, useId } from 'react';
import { Clipboard, X, Sparkles, Check, CircleHelp } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
import { getPrimaryName } from '../../utils/formatters';
import { parseWhatsAppList } from '../../utils/whatsappParser';
import FundoModal from './FundoModal';

/** Linha em que dois ou mais atletas empataram: o usuário escolhe qual é. */
const ehAmbigua = (item) => (item.candidatos || []).length > 1;
/** Linha ambígua ainda sem escolha: não dá para confirmar a convocação assim. */
const faltaEscolher = (item) => ehAmbigua(item) && !item.matchedPlayer && !item.criarNovo;
/** Linha que vai virar um atleta novo no cadastro. */
const vaiCriar = (item) => !item.matchedPlayer && (!ehAmbigua(item) || item.criarNovo);

const estiloCampo = {
  padding: '6px 10px',
  fontSize: '0.82rem',
  height: '32px',
  marginBottom: 0,
  borderRadius: '8px',
  border: '1px solid rgba(251, 191, 36, 0.4)'
};

export default function WhatsAppImportModal({
  isOpen,
  onClose,
  playersList = [],
  onApply,
  isSubmitting = false
}) {
  const tituloId = useId();
  const [whatsAppText, setWhatsAppText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);

  if (!isOpen) return null;

  const handleParse = () => {
    const items = parseWhatsAppList(whatsAppText, playersList);
    setParsedItems(items);
  };

  // Atualiza um item sem mexer no objeto antigo (o React compara por referência)
  const atualizarItem = (idx, campos) =>
    setParsedItems(prev => prev.map((item, i) => (i === idx ? { ...item, ...campos } : item)));

  const escolherCandidato = (idx, valor) => {
    if (valor === 'novo') {
      atualizarItem(idx, { matchedPlayer: null, criarNovo: true });
      return;
    }
    const escolhido = (parsedItems[idx].candidatos || []).find(c => String(c.id) === valor) || null;
    atualizarItem(idx, { matchedPlayer: escolhido, criarNovo: false });
  };

  const selecionados = parsedItems.filter(i => i.selected);
  const pendentes = selecionados.filter(faltaEscolher).length;
  const novos = selecionados.filter(vaiCriar).length;

  const handleApply = () => {
    if (onApply && pendentes === 0) {
      onApply(selecionados);
    }
  };

  const handleClose = () => {
    setParsedItems([]);
    setWhatsAppText('');
    onClose();
  };

  return (
    <FundoModal
      tituloId={tituloId}
      onClose={isSubmitting ? undefined : handleClose}
      estilo={{ background: 'rgba(0,0,0,0.88)', zIndex: 1200, padding: '12px' }}
    >
      <div className="glass-card" style={{ width: '100%', maxWidth: '540px', padding: '20px 16px', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 id={tituloId} className="font-extrabold text-main flex items-center gap-2">
            <Clipboard color="#25D366" size={20} /> Reconhecer Lista do WhatsApp
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            aria-label="Fechar"
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-muted mb-3">
          Cole a mensagem da lista do futebol. Atletas já cadastrados serão reconhecidos e novos atletas podem ser editados abaixo antes de convocar!
        </p>

        <textarea
          rows={5}
          className="input"
          aria-label="Lista do WhatsApp"
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
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-muted">
                {selecionados.length} de {parsedItems.length} selecionados:
              </span>
              {novos > 0 && (
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 'bold' }}>
                  ({novos} novos serão criados)
                </span>
              )}
            </div>

            {parsedItems.map((item, idx) => {
              const ambigua = ehAmbigua(item);
              return (
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
                      onChange={() => atualizarItem(idx, { selected: !item.selected })}
                      aria-label={`Convocar "${item.cleanedText}"`}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: '800', color: 'var(--text-main)', wordBreak: 'break-word', lineHeight: 1.25 }}>
                        {item.originalLine}
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Status do Jogador ou Campo de Edição */}
                  <div style={{ paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Empate entre atletas parecidos: o usuário diz qual é, ou cadastra um novo */}
                    {ambigua && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <CircleHelp size={15} color="#fbbf24" style={{ flexShrink: 0 }} />
                        <select
                          className="input"
                          value={item.matchedPlayer ? String(item.matchedPlayer.id) : (item.criarNovo ? 'novo' : '')}
                          onChange={e => escolherCandidato(idx, e.target.value)}
                          aria-label={`Qual atleta é "${item.cleanedText}"?`}
                          style={{ ...estiloCampo, flex: 1, padding: '4px 10px' }}
                        >
                          <option value="" disabled>Mais de um atleta parecido: escolha qual é</option>
                          {item.candidatos.map(c => (
                            <option key={c.id} value={String(c.id)}>
                              {getPrimaryName(c.nickname, c.username)} (OVR {calcOVR(c)})
                            </option>
                          ))}
                          <option value="novo">Nenhum destes: cadastrar novo atleta</option>
                        </select>
                      </div>
                    )}

                    {!ambigua && item.matchedPlayer && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.12)', border: '1px solid rgba(0, 245, 155, 0.3)', padding: '4px 10px', borderRadius: '8px', alignSelf: 'flex-start' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <Check size={13} /> Atleta: {getPrimaryName(item.matchedPlayer.nickname, item.matchedPlayer.username)}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          (OVR {calcOVR(item.matchedPlayer)})
                        </span>
                      </div>
                    )}

                    {vaiCriar(item) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <span className="badge badge-gold" style={{ fontSize: '0.68rem', padding: '4px 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Sparkles size={11} /> Novo
                        </span>
                        <input
                          type="text"
                          className="input"
                          value={item.suggestedName}
                          onChange={(e) => atualizarItem(idx, { suggestedName: e.target.value })}
                          placeholder="Nome para o cadastro e carta FUT"
                          aria-label="Nome do novo atleta"
                          style={{ ...estiloCampo, flex: 1 }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {pendentes > 0 && (
          <div style={{ fontSize: '0.78rem', color: '#fbbf24', textAlign: 'center', marginBottom: '10px' }}>
            Escolha o atleta certo em {pendentes} linha(s) com nomes parecidos (ou desmarque a linha).
          </div>
        )}

        <div className="flex gap-3">
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={handleApply}
            disabled={isSubmitting || selecionados.length === 0 || pendentes > 0}
          >
            {isSubmitting
              ? 'Cadastrando & Convocando...'
              : `Confirmar Convocação (${selecionados.length} Atletas)`}
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
    </FundoModal>
  );
}
