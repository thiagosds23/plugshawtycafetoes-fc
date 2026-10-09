import React, { useEffect, useState, useContext, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Edit2, Plus, Loader2, UserCheck, Users, Search, 
  ArrowUpDown, FileSpreadsheet, ClipboardList, ExternalLink, 
  ShieldCheck, Download, HardDriveDownload, Check, X,
  CheckCircle2, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { AuthContext } from '../AuthContext';
import { calcOVR } from '../utils/ovr';
import { formatPhotoUrl, isAdminUser } from '../config';
import { api } from '../utils/api';
import { baixarBackup } from '../utils/backup';
import { useEscapeKey } from '../utils/useEscapeKey';
import { waitForImages } from '../utils/exportImage';
import { formatHeight, getPrimaryName } from '../utils/formatters';
import FutCard from './FutCard';
import PhotoAdjustModal from './player/PhotoAdjustModal';
import { downscaleForAI } from '../utils/imageProcessing';
import EditPlayerModal from './player/EditPlayerModal';
import AuditModal from './player/AuditModal';
import PlayerDetailsModal from './player/PlayerDetailsModal';
import '../fut-card.css';

export default function Players() {
  const { user, updateUser } = useContext(AuthContext);
  const isAdmin = isAdminUser(user);
  const meuId = user?.id;
  const navigate = useNavigate();
  const location = useLocation();

  const [players, setPlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('ALL');
  const [sortBy, setSortBy] = useState('ovr'); // 'ovr', 'goals', 'win_rate', 'name'
  
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // Crop modal state
  const [cropModalPlayer, setCropModalPlayer] = useState(null);
  const [tempImageSrc, setTempImageSrc] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Evaluation modal state
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalAnswered, setEvalAnswered] = useState(() => {
    return localStorage.getItem('has_answered_eval_' + (user?.id || 'guest')) === 'true';
  });
  const [evalConfirmationView, setEvalConfirmationView] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const fecharAvaliacao = () => { setShowEvalModal(false); setEvalConfirmationView(false); };
  useEscapeKey(fecharAvaliacao, showEvalModal);

  // Player Stats Modal state
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  const [downloadingCardId, setDownloadingCardId] = useState(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);

  // Histórico do atleta aberto no perfil. Trocar de atleta antes da resposta chegar
  // cancela o pedido anterior, senão o histórico de um aparecia no perfil do outro.
  // Erro do servidor vira lista vazia: um { error } no lugar da lista quebrava o .map.
  const historicoId = selectedPlayerModal?.id;
  useEffect(() => {
    if (!historicoId) return undefined;
    const controle = new AbortController();
    setPlayerHistory([]);
    setPlayerHistoryLoading(true);
    api(`/users/${historicoId}/history`, { signal: controle.signal })
      .then(data => setPlayerHistory(Array.isArray(data) ? data : []))
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('Erro ao carregar o histórico do atleta:', err);
        setPlayerHistory([]);
      })
      .finally(() => {
        if (!controle.signal.aborted) setPlayerHistoryLoading(false);
      });
    return () => controle.abort();
  }, [historicoId]);

  const EVAL_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdBKBRFIXYLRsJwf0FwNqQJqhD8a5PvD0xLbB9zY1v3x26gQw/viewform';

  const handleConfirmAlreadyAnswered = () => {
    localStorage.setItem('has_answered_eval_' + (user?.id || 'guest'), 'true');
    setEvalAnswered(true);
    setEvalConfirmationView(true);

    // Registra na auditoria do app. É só um registro: se falhar, a confirmação do
    // atleta continua valendo e não vale incomodá-lo com um erro.
    api('/audit-logs', {
      method: 'POST',
      body: { action: 'AVALIAÇÃO', details: 'Confirmou que respondeu ao Formulário Oficial de Avaliação' },
      user
    }).catch(err => console.error('Não foi possível registrar a avaliação na auditoria:', err));
  };

  const handleGoToForm = () => {
    window.open(EVAL_FORM_URL, '_blank', 'noopener,noreferrer');
    setShowEvalModal(false);
    setEvalConfirmationView(false);
  };

  const handleDownloadBackupDirect = async () => {
    setIsDownloadingBackup(true);
    try {
      await baixarBackup(user);
      alert('✅ Backup do clube exportado com sucesso em JSON!');
    } catch (err) {
      alert('Erro ao baixar backup: ' + err.message);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleDownloadCard = async (player, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const cardEl = document.getElementById(`fut-card-${player.id}`);
    if (!cardEl) return;

    setDownloadingCardId(player.id);
    try {
      await waitForImages(cardEl);
      const dataUrl = await toPng(cardEl, { 
        cacheBust: false, 
        pixelRatio: 2.5,
        filter: (node) => !node.classList?.contains('fut-card-btn-action') && !node.classList?.contains('fut-card-shine'),
        style: {
          transform: 'none',
          boxShadow: 'none'
        }
      });

      const playerName = getPrimaryName(player.nickname, player.username);
      const fileName = `carta-fut-${playerName.toLowerCase().replace(/\s+/g, '-')}-ovr${calcOVR(player)}.png`;

      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar imagem da carta:', err);
      alert('Não foi possível gerar a imagem da carta FUT. Tente novamente.');
    } finally {
      setDownloadingCardId(null);
    }
  };

  // "Meu Jogador" é só o atleta com o mesmo id do usuário logado. Comparar por nome ou
  // apelido marcava outro atleta (nome parecido, apelido repetido) como se fosse o próprio
  // e liberava a edição da carta dele.
  const isMyPlayer = useCallback(
    (p) => Boolean(meuId && p && String(p.id) === String(meuId)),
    [meuId]
  );

  const loadPlayers = useCallback(() => {
    api('/stats')
      .then(data => { if (Array.isArray(data)) setPlayers(data); })
      // Mantém a lista que já está na tela: um erro não pode esvaziar o elenco
      .catch(err => console.error('Erro ao carregar o elenco:', err));
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const handleImportExcel = async (e) => {
    const input = e.target;
    const file = input.files && input.files[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // A importação é exclusiva do administrador: sem o token o servidor recusa
      const data = await api('/users/import-ratings-excel', { method: 'POST', body: formData, user });
      alert(`✅ Sucesso! Foram atualizados os atributos de ${data.updatedCount} atletas a partir da planilha.`);
      loadPlayers();
    } catch (err) {
      console.error('Erro na importação da planilha:', err);
      alert(err.message || 'Erro ao importar planilha.');
    } finally {
      setIsImporting(false);
      input.value = '';
    }
  };

  const handlePhotoSelect = (player, e) => {
    if (!isMyPlayer(player) && !isAdmin) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const file = e.target.files && e.target.files[0];
    if (file) {
      setRawFile(file);
      setCropModalPlayer(player);
      const reader = new FileReader();
      reader.onload = () => {
        setTempImageSrc(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAdjustExistingPhoto = (player) => {
    if (!isMyPlayer(player) && !isAdmin) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    // Parte da foto atual (já com o fundo recortado); a original continua disponível
    // dentro do modal para quem quiser recomeçar. Sempre pela URL versionada (?v=): a
    // URL sem versão vinha do cache com a foto antiga e regravava por cima da nova.
    const photoToLoad = player.photo || player.original_photo;
    if (!photoToLoad) return;
    setRawFile(null);
    setCropModalPlayer(player);
    setTempImageSrc(formatPhotoUrl(photoToLoad));
  };

  const removePlayerPhoto = async (playerId) => {
    const targetPlayer = players.find(p => p.id === playerId);
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
      alert('Você só pode remover a foto do seu próprio atleta.');
      return;
    }
    if (!window.confirm('Tem certeza que deseja remover a sua foto?')) return;
    try {
      await api(`/users/${playerId}/photo`, { method: 'DELETE', user });
    } catch (err) {
      alert(err.message || 'Erro ao remover foto.');
      return;
    }
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, photo: null, original_photo: null } : p));
    if (isMyPlayer(targetPlayer)) {
      updateUser({ photo: null, original_photo: null });
    }
    if (cropModalPlayer && cropModalPlayer.id === playerId) {
      setCropModalPlayer(null);
      setTempImageSrc(null);
    }
    loadPlayers();
  };

  const handleSaveCroppedPhoto = async (croppedBlob, originalFile) => {
    if (!cropModalPlayer || !croppedBlob) return;
    if (!isMyPlayer(cropModalPlayer) && !isAdmin) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const alvo = cropModalPlayer;
    const formData = new FormData();
    const croppedExt = croppedBlob.type && croppedBlob.type.includes('webp') ? 'webp' : 'png';
    formData.append('photo', croppedBlob, `cropped_player.${croppedExt}`);
    if (originalFile) {
      const compactOriginal = await downscaleForAI(originalFile, 1000);
      formData.append('original_photo', compactOriginal, 'original_player.jpg');
    }
    let data;
    try {
      data = await api(`/users/${alvo.id}/photo`, { method: 'POST', body: formData, user });
    } catch (err) {
      alert(err.message || 'Erro ao salvar foto.');
      return;
    }

    // Sem foto original nova (só reenquadrou), a original guardada continua a mesma
    const original = data.origUrl || alvo.original_photo || null;
    setPlayers(prev => prev.map(p => p.id === alvo.id ? { ...p, photo: data.photoUrl, original_photo: original } : p));

    if (isMyPlayer(alvo)) {
      updateUser({ photo: data.photoUrl, original_photo: original });
    }

    setCropModalPlayer(null);
    setTempImageSrc(null);
    setRawFile(null);
    loadPlayers();
  };

  // Atleta cuja edição foi aberta por último: a resposta do GET /users/:id de um atleta
  // anterior não pode preencher o formulário de outro
  const edicaoAtual = useRef(null);

  const startEditing = useCallback((player) => {
    if (!isMyPlayer(player) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    edicaoAtual.current = player.id;
    setEditingId(player.id);
    setEditForm({
      username: player.username || '',
      nickname: player.nickname || '',
      position: player.position || 'MEI',
      height: player.height ? formatHeight(player.height) : '',
      weight: player.weight || '',
      // /stats e /users não trazem telefone e e-mail (dados pessoais): chegam logo abaixo
      phone: '',
      email: ''
    });

    // GET /users/:id com o token só devolve telefone e e-mail para o próprio atleta ou o
    // administrador. Se não vierem, os campos ficam vazios e o servidor não os altera.
    api(`/users/${player.id}`, { user })
      .then(completo => {
        if (edicaoAtual.current !== player.id || !completo) return;
        setEditForm(prev => ({
          ...prev,
          // Não sobrescreve o que o atleta já começou a digitar enquanto carregava
          phone: prev.phone || completo.phone || '',
          email: prev.email || completo.email || ''
        }));
      })
      .catch(err => console.error('Erro ao carregar telefone e e-mail do atleta:', err));
  }, [isMyPlayer, isAdmin, user]);

  // Pedido de abrir a edição vindo de outra tela: o cabeçalho do app (a própria carta) ou
  // a tela da partida (admin editando outro atleta). playerId diz quem; sem ele, o próprio.
  const autoEdit = Boolean(location.state?.autoEdit);
  const autoEditId = location.state?.playerId;
  useEffect(() => {
    if (!autoEdit || players.length === 0) return;
    const alvoId = autoEditId ?? meuId;
    const alvo = players.find(p => String(p.id) === String(alvoId));
    if (alvo) startEditing(alvo);
    // Limpa o pedido pelo React Router. O window.history.replaceState não avisa o
    // Router: o location.state continuava com autoEdit e o modal reabria sozinho a cada
    // recarga da lista (ex.: depois de salvar).
    navigate(location.pathname, { replace: true, state: null });
  }, [autoEdit, autoEditId, meuId, players, startEditing, navigate, location.pathname]);

  const saveProfile = async (id) => {
    const targetPlayer = players.find(p => p.id === id);
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    const payload = {
      username: editForm.username,
      nickname: editForm.nickname,
      position: editForm.position,
      height: formatHeight(editForm.height),
      weight: editForm.weight
    };
    // Telefone e e-mail só vão quando preenchidos: em branco quer dizer "não carregado",
    // nunca "apagar" (o servidor também ignora vazios)
    const phone = String(editForm.phone || '').trim();
    const email = String(editForm.email || '').trim();
    if (phone) payload.phone = phone;
    if (email) payload.email = email;

    try {
      await api(`/users/${id}/profile`, { method: 'PUT', body: payload, user });
    } catch (err) {
      alert(err.message || 'Erro ao salvar perfil.');
      return;
    }
    if (isMyPlayer(targetPlayer)) {
      updateUser(payload);
    }
    setEditingId(null);
    loadPlayers();
  };

  const createPlayer = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    try {
      await api('/users', { method: 'POST', body: { username: newUsername.trim() }, user });
    } catch (err) {
      alert(err.message || 'Erro ao cadastrar atleta.');
      return;
    }
    setNewUsername('');
    setIsCreating(false);
    loadPlayers();
  };

  const deletePlayer = async (id) => {
    if (!isAdmin) {
      alert('Apenas o Administrador pode excluir jogadores.');
      return;
    }
    if (!window.confirm('Tem certeza que deseja excluir este jogador? Esta ação não pode ser desfeita.')) return;
    try {
      await api(`/users/${id}`, { method: 'DELETE', user });
    } catch (err) {
      alert(err.message || 'Erro ao excluir jogador.');
      return;
    }
    setEditingId(null);
    loadPlayers();
  };

  // Separação entre Meu Jogador e Resto do Elenco
  const myPlayer = players.find(p => isMyPlayer(p));
  const otherPlayers = myPlayer ? players.filter(p => p.id !== myPlayer.id) : players;

  // Filtros aplicados no Resto do Elenco
  const filteredOtherPlayers = (otherPlayers || []).filter(p => {
    if (!p) return false;
    const matchesSearch = String(p.nickname || p.username || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedPosition === 'ALL') return true;
    if (selectedPosition === 'DEF') return ['ZAG', 'LAT', 'VOL'].includes(p.position);
    return p.position === selectedPosition;
  }).sort((a, b) => {
    if (!a || !b) return 0;
    if (sortBy === 'ovr') return calcOVR(b) - calcOVR(a);
    if (sortBy === 'goals') return (b.goals || 0) - (a.goals || 0);
    if (sortBy === 'win_rate') return (b.win_rate || 0) - (a.win_rate || 0);
    if (sortBy === 'name') return String(a.nickname || a.username || '').localeCompare(String(b.nickname || b.username || ''));
    return 0;
  });

  const editingPlayer = players.find(p => p.id === editingId);

  // Renderizador de Carta FUT
  const renderPlayerCard = (player, isEditable, idx = 0) => {
    if (!player) return null;

    const actionButtons = (
      <>
        <button 
          onClick={(e) => handleDownloadCard(player, e)}
          style={{ 
            position: 'absolute', 
            top: 14, 
            left: 16, 
            width: '34px',
            height: '34px',
            background: 'rgba(18, 20, 32, 0.94)', 
            border: '1.5px solid rgba(0, 245, 155, 0.55)', 
            borderRadius: '50%', 
            padding: 0, 
            color: '#fff', 
            cursor: 'pointer', 
            zIndex: 10,
            boxShadow: '0 0 12px rgba(0, 245, 155, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          className="fut-card-btn-action"
          title="Baixar ou Compartilhar Carta FUT em HD"
          aria-label="Baixar a carta FUT em HD"
          disabled={downloadingCardId === player.id}
        >
          {downloadingCardId === player.id ? (
            <Loader2 size={15} className="animate-spin" color="var(--primary)" />
          ) : (
            <Download size={15} color="var(--primary)" />
          )}
        </button>

        {isEditable && (
          <button
            onClick={(e) => {
              // O botão fica dentro da carta: sem isso o clique também abria o perfil
              e.stopPropagation();
              startEditing(player);
            }}
            style={{
              position: 'absolute',
              top: 14, 
              right: 16, 
              width: '34px',
              height: '34px',
              background: 'rgba(18, 20, 32, 0.94)', 
              border: '1.5px solid var(--primary)', 
              borderRadius: '50%', 
              padding: 0, 
              color: '#fff', 
              cursor: 'pointer', 
              zIndex: 10,
              boxShadow: '0 0 12px rgba(0, 245, 155, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="fut-card-btn-action"
            title="Editar Meu Perfil & Carta"
            aria-label="Editar meu perfil e carta"
          >
            <Edit2 size={15} color="var(--primary)" />
          </button>
        )}
      </>
    );

    return (
      <motion.div 
        key={player.id || idx} 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: idx * 0.03 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <FutCard 
            player={player}
            onCardClick={() => setSelectedPlayerModal(player)}
            actionButtons={actionButtons}
            style={isEditable ? { filter: 'drop-shadow(0 0 18px rgba(0, 245, 155, 0.45))' } : {}}
          />

          {/* Barra de Estatísticas Resumidas */}
          <div className="glass-card" style={{ padding: '8px 16px', width: '310px', display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: '0.75rem', borderRadius: '12px' }}>
            <div>
              <div className="text-muted font-bold">Jogos</div>
              <div className="font-extrabold text-main">{player.matches_count || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">Gols</div>
              <div className="font-extrabold text-primary">{player.goals || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">V/E/D</div>
              <div className="font-extrabold" style={{ color: 'var(--cyan)' }}>{player.wins || 0}/{player.draws || 0}/{player.losses || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">Aprov.</div>
              <div className="font-extrabold text-gold">{player.win_rate || 0}%</div>
            </div>
          </div>

          {/* Botões de Ação para o Meu Jogador */}
          {isEditable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '310px' }}>
              <button 
                className="btn" 
                style={{ 
                  width: '100%', 
                  padding: '11px 16px', 
                  fontSize: '0.86rem', 
                  fontWeight: '800', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  borderRadius: '12px',
                  boxShadow: '0 0 16px rgba(0, 245, 155, 0.25)'
                }}
                onClick={() => startEditing(player)}
              >
                <Edit2 size={16} /> Editar Meu Jogador
              </button>

              {isAdmin && (
                <>
                  <button 
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      padding: '10px 16px', 
                      fontSize: '0.82rem', 
                      fontWeight: '800', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(139, 92, 246, 0.45)',
                      background: 'rgba(139, 92, 246, 0.1)',
                      color: '#c084fc',
                      boxShadow: '0 0 14px rgba(139, 92, 246, 0.15)'
                    }}
                    onClick={() => setShowAuditModal(true)}
                  >
                    <ShieldCheck size={16} color="#c084fc" /> Auditoria do App (Admin)
                  </button>

                  <button 
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      padding: '9px 16px', 
                      fontSize: '0.80rem', 
                      fontWeight: '800', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(96, 165, 250, 0.4)',
                      background: 'rgba(96, 165, 250, 0.08)',
                      color: '#60a5fa'
                    }}
                    onClick={handleDownloadBackupDirect}
                    disabled={isDownloadingBackup}
                  >
                    <HardDriveDownload size={15} color="#60a5fa" className={isDownloadingBackup ? 'animate-spin' : ''} />
                    {isDownloadingBackup ? 'Gerando Backup...' : 'Baixar Backup do Clube (.json)'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Botões para Outros Atletas */}
          {!isEditable && (
            <div style={{ width: '310px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {isAdmin && (
                <button 
                  className="btn" 
                  style={{ 
                    width: '100%', 
                    padding: '9px 14px', 
                    fontSize: '0.82rem', 
                    fontWeight: '800', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '6px',
                    borderRadius: '10px'
                  }}
                  onClick={() => startEditing(player)}
                >
                  <Edit2 size={15} /> Editar Jogador (Admin)
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      
      {/* Page Title & Add Player */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 className="font-extrabold text-main" style={{ margin: '0 0 4px', letterSpacing: '-0.4px' }}>
              Plantel do Elenco
            </h2>
            <div className="text-muted">
              {players.length} Atletas cadastrados
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
            {/* Botão de Avaliação do Elenco (Para todos os jogadores) */}
            <button 
              type="button" 
              className="btn" 
              style={{ 
                flex: 1, 
                padding: '10px 6px', 
                fontSize: '0.8rem', 
                fontWeight: '800',
                background: evalAnswered 
                  ? 'rgba(0, 245, 155, 0.08)' 
                  : 'linear-gradient(135deg, rgba(0, 245, 155, 0.22) 0%, rgba(0, 180, 216, 0.22) 100%)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                boxShadow: evalAnswered ? 'none' : '0 0 16px rgba(0, 245, 155, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
              onClick={() => { setShowEvalModal(true); setEvalConfirmationView(evalAnswered); }}
              title="Preencher ou consultar formulário de avaliação dos jogadores"
            >
              <ClipboardList size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Avaliação {evalAnswered && <CheckCircle2 size={13} color="var(--primary)" />}
              </span>
            </button>

            {isAdmin && (
              <>
                <label 
                  className="btn btn-secondary desktop-only" 
                  style={{ width: 'auto', padding: '10px', cursor: 'pointer', margin: 0, alignItems: 'center', justifyContent: 'center', display: 'flex', gap: '8px' }}
                  title="Importar notas da planilha Excel (.xlsx)"
                >
                  <FileSpreadsheet size={16} color="var(--primary)" /> 
                  {isImporting && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    style={{ display: 'none' }} 
                    onChange={handleImportExcel}
                    aria-label="Importar notas da planilha Excel"
                    disabled={isImporting}
                  />
                </label>

                <button className="btn" style={{ flex: 1, padding: '10px 6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={() => setIsCreating(!isCreating)}>
                  <Plus size={16} style={{ flexShrink: 0 }} /> Novo Atleta
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            onSubmit={createPlayer} 
            className="glass-card mb-6"
          >
            <div className="flex gap-3">
              <div style={{ flex: '1 1 200px' }}>
                <label className="label">Nome do Jogador</label>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0 }}
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)} 
                  autoFocus
                  placeholder="Nome do atleta"
                />
              </div>
              <button type="submit" className="btn" style={{ width: 'auto', minWidth: '100px' }}>Salvar</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 1. SEÇÃO: MEU JOGADOR (Exclusivo para o atleta logado editar a sua carta) */}
      {myPlayer && (
        <div style={{ marginBottom: '38px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 className="font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck color="var(--primary)" size={22} /> Meu Jogador
              </h3>
              <p className="text-muted" style={{ margin: '3px 0 0' }}>
                Sua carta oficial no clube. Apenas você pode alterar seu perfil, apelido e foto.
              </p>
            </div>
          </div>

          <div 
            className="glass-card" 
            style={{ 
              padding: '24px 14px', 
              display: 'flex', 
              justifyContent: 'center', 
              background: 'radial-gradient(ellipse at top, rgba(0, 245, 155, 0.08) 0%, rgba(14, 16, 23, 0.95) 70%)',
              borderColor: 'rgba(0, 245, 155, 0.35)',
              borderRadius: '24px'
            }}
          >
            {renderPlayerCard(myPlayer, true, 0)}
          </div>
        </div>
      )}

      {/* 2. SEÇÃO: RESTO DO ELENCO (Somente Visualização) */}
      <div style={{ marginTop: myPlayer ? '36px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className="font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users color="var(--primary)" size={22} /> Resto do Elenco
            </h3>
            <p className="text-muted" style={{ margin: '3px 0 0' }}>
              Cartas dos outros atletas do time ({otherPlayers.length} jogadores) • Somente visualização
            </p>
          </div>
        </div>

        {/* Search, Position Filter and Sort Bar */}
        <div className="glass-card mb-8" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* Search Box */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar atleta..."
                aria-label="Buscar atleta no elenco"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '40px', marginBottom: 0, width: '100%', height: '40px' }}
              />
            </div>

            {/* Position Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', width: '100%' }}>
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'ATA', label: 'ATA' },
                { id: 'MEI', label: 'MEI' },
                { id: 'DEF', label: 'DEF' },
                { id: 'GOL', label: 'GOL' }
              ].map(pos => (
                <button
                  key={pos.id}
                  type="button"
                  className={`btn ${selectedPosition === pos.id ? '' : 'btn-secondary'}`}
                  style={{ 
                    padding: '8px 2px', 
                    fontSize: '0.78rem', 
                    fontWeight: 800, 
                    width: '100%', 
                    borderRadius: '10px', 
                    textAlign: 'center', 
                    justifyContent: 'center' 
                  }}
                  onClick={() => setSelectedPosition(pos.id)}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <ArrowUpDown size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
              <select 
                className="input" 
                style={{ width: '100%', marginBottom: 0, padding: '7px 12px', fontSize: '0.80rem', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="ovr">Maior OVR</option>
                <option value="goals">Mais Gols</option>
                <option value="win_rate">Melhor Aproveitamento</option>
                <option value="name">Ordem Alfabética</option>
              </select>
            </div>

          </div>
        </div>

        {/* Grid de Cartas do Resto do Elenco */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '28px', justifyContent: 'center' }}>
          {filteredOtherPlayers.map((player, idx) => renderPlayerCard(player, false, idx))}

          {filteredOtherPlayers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }} className="glass-card text-muted">
              Nenhum atleta encontrado para os filtros selecionados.
            </div>
          )}
        </div>
      </div>

      {/* Photo Crop Modal with Drag to Position & AI Background Removal */}
      {cropModalPlayer && tempImageSrc && (
        <PhotoAdjustModal 
          player={cropModalPlayer} 
          initialSrc={tempImageSrc} 
          rawFile={rawFile}
          onClose={() => { setCropModalPlayer(null); setTempImageSrc(null); setRawFile(null); }}
          onSave={handleSaveCroppedPhoto}
          onDeletePhoto={() => removePlayerPhoto(cropModalPlayer.id)}
        />
      )}

      {/* Modern Edit Profile Modal Overlay */}
      {editingPlayer && (
        <EditPlayerModal
          key={editingPlayer.id}
          player={editingPlayer}
          editForm={editForm}
          setEditForm={setEditForm}
          onClose={() => setEditingId(null)}
          onSave={() => saveProfile(editingPlayer.id)}
          onDeletePlayer={() => deletePlayer(editingPlayer.id)}
          onOpenAdjustPhoto={() => openAdjustExistingPhoto(editingPlayer)}
          onSelectNewPhoto={(e) => handlePhotoSelect(editingPlayer, e)}
          onDeletePhoto={() => removePlayerPhoto(editingPlayer.id)}
          onPinChanged={loadPlayers}
          // Com o ajuste de foto aberto por cima, o Esc fecha só ele (não perde a edição)
          fecharComEsc={!cropModalPlayer}
          isAdmin={isAdmin}
        />
      )}

      {/* Evaluation Form Modal Popup */}
      {showEvalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div 
            initial={{ scale: 0.92, opacity: 0, y: 15 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            className="glass-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="avaliacao-titulo"
            style={{
              width: '460px',
              maxWidth: '94vw', 
              background: 'rgba(15, 18, 28, 0.98)', 
              border: '1px solid rgba(0, 245, 155, 0.35)', 
              borderRadius: '24px', 
              boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(0,245,155,0.15)', 
              padding: '26px 22px', 
              textAlign: 'center', 
              position: 'relative' 
            }}
          >
            <button
              type="button"
              onClick={fecharAvaliacao}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Fechar"
            >
              <X size={16} />
            </button>

            {!evalConfirmationView ? (
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(0,245,155,0.1)', border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 20px rgba(0,245,155,0.25)' }}>
                  <ClipboardList size={28} color="var(--primary)" />
                </div>

                <h3 id="avaliacao-titulo" className="font-extrabold text-main" style={{ margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                  Avaliação Oficial do Elenco
                </h3>
                <p className="text-muted" style={{ margin: '0 0 20px', lineHeight: 1.4 }}>
                  plugshawtycafetoes FC • Temporada {new Date().getFullYear()}
                </p>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px 14px', marginBottom: '22px', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#fff', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HelpCircle size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                    <span>Você já respondeu ao formulário de avaliação dos jogadores?</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    As notas atribuídas pelos atletas são indispensáveis para calcular os atributos oficiais (PAC, SHO, PAS, DRI, DEF, PHY) e o OVR de cada carta FUT.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ 
                      padding: '13px 18px', 
                      fontSize: '0.90rem', 
                      fontWeight: '800', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #00f59b 0%, #00d285 100%)',
                      color: '#000',
                      boxShadow: '0 0 20px rgba(0,245,155,0.3)'
                    }}
                    onClick={handleGoToForm}
                  >
                    <ExternalLink size={16} /> Não, responder agora
                  </button>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ 
                      padding: '12px 18px', 
                      fontSize: '0.86rem', 
                      fontWeight: '700', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onClick={handleConfirmAlreadyAnswered}
                  >
                    <Check size={16} color="var(--primary)" /> Sim, já respondi
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0,245,155,0.12)', border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 25px rgba(0,245,155,0.3)' }}>
                  <Check size={28} color="var(--primary)" />
                </div>

                <h3 id="avaliacao-titulo" className="font-extrabold text-main" style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={22} color="var(--primary)" /> Tudo Certo!
                </h3>
                <p className="text-muted" style={{ margin: '0 0 22px', lineHeight: 1.45 }}>
                  Suas notas já foram enviadas e são levadas em conta no cálculo oficial do OVR do elenco. Segue o jogo!
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ padding: '12px', fontSize: '0.90rem', fontWeight: '800', borderRadius: '12px' }}
                    onClick={() => { setShowEvalModal(false); setEvalConfirmationView(false); }}
                  >
                    Ok, Continuar
                  </button>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '10px', fontSize: '0.78rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleGoToForm}
                  >
                    <ExternalLink size={13} /> Abrir formulário novamente
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* Central de Auditoria Exclusiva do Admin */}
      {showAuditModal && (
        <AuditModal onClose={() => setShowAuditModal(false)} adminUser={user} />
      )}

      {/* Modal Reutilizável de Estatísticas e Histórico do Atleta */}
      <PlayerDetailsModal 
        isOpen={Boolean(selectedPlayerModal)}
        player={selectedPlayerModal}
        onClose={() => setSelectedPlayerModal(null)}
        playerHistory={playerHistory}
        playerHistoryLoading={playerHistoryLoading}
        isMyPlayer={isMyPlayer}
        isAdmin={isAdmin}
        onEdit={(p) => startEditing(p)}
        allStats={players}
      />

    </motion.div>
  );
}
