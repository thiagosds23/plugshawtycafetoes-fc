import React, { useEffect, useState, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Edit2, Plus, Loader2, UserCheck, Users, Search, 
  ArrowUpDown, FileSpreadsheet, ClipboardList, ExternalLink, 
  ShieldCheck, Download, HardDriveDownload, Check, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { AuthContext } from '../AuthContext';
import { calcOVR } from '../utils/ovr';
import { API_URL, isAdminUser } from '../config';
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

  // Player Stats Modal state
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  const [downloadingCardId, setDownloadingCardId] = useState(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);

  useEffect(() => {
    if (selectedPlayerModal) {
      setPlayerHistoryLoading(true);
      fetch(`${API_URL}/users/${selectedPlayerModal.id}/history`)
        .then(res => res.json())
        .then(data => {
          setPlayerHistory(data);
          setPlayerHistoryLoading(false);
        })
        .catch(err => {
          console.error(err);
          setPlayerHistoryLoading(false);
        });
    }
  }, [selectedPlayerModal]);

  const EVAL_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdBKBRFIXYLRsJwf0FwNqQJqhD8a5PvD0xLbB9zY1v3x26gQw/viewform';

  const handleConfirmAlreadyAnswered = () => {
    localStorage.setItem('has_answered_eval_' + (user?.id || 'guest'), 'true');
    setEvalAnswered(true);
    setEvalConfirmationView(true);

    // Registra na auditoria do app
    fetch(`${API_URL}/audit-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': String(user?.id) },
      body: JSON.stringify({ action: 'AVALIAÇÃO', details: 'Confirmou que respondeu ao Formulário Oficial de Avaliação' })
    }).catch(() => {});
  };

  const handleGoToForm = () => {
    window.open(EVAL_FORM_URL, '_blank', 'noopener,noreferrer');
    setShowEvalModal(false);
    setEvalConfirmationView(false);
  };

  const handleDownloadBackupDirect = async () => {
    setIsDownloadingBackup(true);
    try {
      const res = await fetch(`${API_URL}/admin/backup`, {
        headers: { 'x-user-id': String(user?.id) }
      });
      if (!res.ok) throw new Error('Falha ao gerar backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-plugshawty-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
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

  const normalize = str => (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Verifica se o jogador corresponde ao usuário logado
  const isMyPlayer = (p) => {
    if (!user || !p) return false;
    if (user.id && p.id && String(p.id) === String(user.id)) return true;
    if (user.username && p.username && normalize(p.username) === normalize(user.username)) return true;
    if (user.nickname && p.nickname && normalize(user.nickname).length >= 2) {
      const uNick = normalize(user.nickname);
      const pNick = normalize(p.nickname);
      if (pNick.split(',').map(s => s.trim()).includes(uNick)) return true;
    }
    return false;
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/users/import-ratings-excel`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Sucesso! Foram atualizados os atributos de ${data.updatedCount} atletas a partir da planilha.`);
        loadPlayers();
      } else {
        alert(data.error || 'Erro ao importar planilha.');
      }
    } catch (err) {
      console.error('Erro na importação da planilha:', err);
      alert('Erro ao enviar arquivo de planilha.');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const loadPlayers = () => {
    fetch(`${API_URL}/stats`)
      .then(res => res.json())
      .then(data => setPlayers(data));
  };
  
  useEffect(() => {
    loadPlayers();
  }, []);

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
    const photoToLoad = player.photo || player.original_photo;
    if (!photoToLoad) return;
    setRawFile(null);
    setCropModalPlayer(player);
    setTempImageSrc(photoToLoad.startsWith('http') ? photoToLoad : `${API_URL}/users/${player.id}/photo`);
  };

  const removePlayerPhoto = async (playerId) => {
    const targetPlayer = players.find(p => p.id === playerId);
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
      alert('Você só pode remover a foto do seu próprio atleta.');
      return;
    }
    if (window.confirm('Tem certeza que deseja remover a sua foto?')) {
      const res = await fetch(`${API_URL}/users/${playerId}/photo`, { 
        method: 'DELETE', 
        headers: { 'x-user-id': user?.id }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao remover foto.');
        return;
      }
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, photo: null, original_photo: null } : p));
      if (cropModalPlayer && cropModalPlayer.id === playerId) {
        setCropModalPlayer(null);
        setTempImageSrc(null);
      }
      loadPlayers();
    }
  };

  const handleSaveCroppedPhoto = async (croppedBlob, originalFile) => {
    if (!cropModalPlayer || !croppedBlob) return;
    if (!isMyPlayer(cropModalPlayer) && !isAdmin) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const formData = new FormData();
    const croppedExt = croppedBlob.type && croppedBlob.type.includes('webp') ? 'webp' : 'png';
    formData.append('photo', croppedBlob, `cropped_player.${croppedExt}`);
    if (originalFile) {
      const compactOriginal = await downscaleForAI(originalFile, 1000);
      formData.append('original_photo', compactOriginal, 'original_player.jpg');
    }
    const res = await fetch(`${API_URL}/users/${cropModalPlayer.id}/photo`, { 
      method: 'POST', 
      headers: { 'x-user-id': user?.id },
      body: formData 
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erro ao salvar foto.');
      return;
    }
    const data = await res.json();
    
    setPlayers(prev => prev.map(p => p.id === cropModalPlayer.id ? { ...p, photo: data.photoUrl, original_photo: data.origUrl || p.original_photo } : p));
    
    if (isMyPlayer(cropModalPlayer) && updateUser) {
      updateUser({ photo: data.photoUrl, original_photo: data.origUrl || data.photoUrl });
    }

    setCropModalPlayer(null);
    setTempImageSrc(null);
    setRawFile(null);
    loadPlayers();
  };

  const isAdmin = isAdminUser(user);

  const startEditing = (player) => {
    if (!isMyPlayer(player) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    setEditingId(player.id);
    setEditForm({
      username: player.username || '',
      nickname: player.nickname || '',
      position: player.position || 'MEI',
      height: player.height ? formatHeight(player.height) : '',
      weight: player.weight || '',
      phone: player.phone || '',
      email: player.email || '',
      pace: player.pace || 50,
      shooting: player.shooting || 50,
      passing: player.passing || 50,
      dribbling: player.dribbling || 50,
      defending: player.defending || 50,
      physical: player.physical || 50
    });
  };

  const location = useLocation();

  useEffect(() => {
    if (location.state?.autoEdit && players.length > 0) {
      const me = players.find(p => isMyPlayer(p));
      if (me) {
        startEditing(me);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, players]);

  const saveProfile = async (id) => {
    const targetPlayer = players.find(p => p.id === id);
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    const payload = {
      ...editForm,
      height: formatHeight(editForm.height)
    };
    const res = await fetch(`${API_URL}/users/${id}/profile`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': user?.id
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erro ao salvar perfil.');
      return;
    }
    if (isMyPlayer(targetPlayer) && updateUser) {
      updateUser(payload);
    }
    setEditingId(null);
    loadPlayers();
  };

  const createPlayer = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername })
    });
    setNewUsername('');
    setIsCreating(false);
    loadPlayers();
  };

  const deletePlayer = async (id) => {
    if (!isAdmin) {
      alert('Apenas o Administrador pode excluir jogadores.');
      return;
    }
    if (window.confirm('Tem certeza que deseja excluir este jogador? Esta ação não pode ser desfeita.')) {
      const res = await fetch(`${API_URL}/users/${id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': user?.id }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao excluir jogador.');
        return;
      }
      setEditingId(null);
      loadPlayers();
    }
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
            onClick={() => startEditing(player)}
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
            <h2 className="text-2xl font-extrabold text-main" style={{ margin: '0 0 4px', letterSpacing: '-0.4px' }}>
              Plantel do Elenco
            </h2>
            <div className="text-muted text-sm">
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
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Avaliação {evalAnswered && '✅'}</span>
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
            className="glass-card mb-6 overflow-hidden"
          >
            <div className="flex gap-3 items-end flex-wrap">
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
              <h3 className="text-xl font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck color="var(--primary)" size={22} /> Meu Jogador
              </h3>
              <p className="text-muted text-xs" style={{ margin: '3px 0 0' }}>
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
            <h3 className="text-xl font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users color="var(--primary)" size={22} /> Resto do Elenco
            </h3>
            <p className="text-muted text-xs" style={{ margin: '3px 0 0' }}>
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
          player={editingPlayer}
          editForm={editForm}
          setEditForm={setEditForm}
          onClose={() => setEditingId(null)}
          onSave={() => saveProfile(editingPlayer.id)}
          onDeletePlayer={() => deletePlayer(editingPlayer.id)}
          onOpenAdjustPhoto={() => openAdjustExistingPhoto(editingPlayer)}
          onSelectNewPhoto={(e) => handlePhotoSelect(editingPlayer, e)}
          onDeletePhoto={() => removePlayerPhoto(editingPlayer.id)}
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
              onClick={() => { setShowEvalModal(false); setEvalConfirmationView(false); }} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>

            {!evalConfirmationView ? (
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(0,245,155,0.1)', border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 20px rgba(0,245,155,0.25)' }}>
                  <ClipboardList size={28} color="var(--primary)" />
                </div>

                <h3 className="text-xl font-extrabold text-main" style={{ margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                  Avaliação Oficial do Elenco
                </h3>
                <p className="text-muted text-xs" style={{ margin: '0 0 20px', lineHeight: 1.4 }}>
                  plugshawtycafetoes FC • Temporada 2026
                </p>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px 14px', marginBottom: '22px', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
                    ❓ Você já respondeu ao formulário de avaliação dos jogadores?
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

                <h3 className="text-xl font-extrabold text-main" style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={22} color="var(--primary)" /> Tudo Certo!
                </h3>
                <p className="text-muted text-sm" style={{ margin: '0 0 22px', lineHeight: 1.45 }}>
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
      />

    </motion.div>
  );
}
