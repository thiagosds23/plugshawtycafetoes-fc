import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { 
  Users, Shuffle, Star, Shield, ArrowLeft, ArrowRight, Share2, Goal, 
  Award, Trash2, RefreshCw, UserPlus, X, CheckCircle2, 
  Clipboard, LayoutList, MapPin, Plus, 
  Footprints, Lightbulb, Clock, Edit2, Swords 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { calcOVR } from '../utils/ovr';
import { API_URL, formatPhotoUrl, authHeaders, isAdminUser } from '../config';
import { waitForImages } from '../utils/exportImage';
import { getPrimaryName, formatShortTeamName } from '../utils/formatters';
import DraftAnimation from './match/DraftAnimation';
import { playDraftSound, playCelebrationSound } from '../utils/soundEffects';
import WhatsAppImportModal from './match/WhatsAppImportModal';
import RatingModal, { ContadorPrazo } from './match/RatingModal';
import TacticalPitch from './match/TacticalPitch';
import PlayerDetailsModal from './player/PlayerDetailsModal';

export default function MatchDetails() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [match, setMatch] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  
  const [showRating, setShowRating] = useState(false);
  const [ratings, setRatings] = useState({});
  const [isExporting, setIsExporting] = useState(false);

  // View Mode: 'list' (Escalação Detalhada) or 'pitch' (Campo Tático)
  const [viewMode, setViewMode] = useState('list');

  // WhatsApp List Convocação Modal State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [isCreatingFromWhatsApp, setIsCreatingFromWhatsApp] = useState(false);

  // Manual New Player Modal State
  const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNickname, setNewPlayerNickname] = useState('');
  const [newPlayerPosition, setNewPlayerPosition] = useState('MEI');

  // Substitute Player Modal state
  const [substituteTarget, setSubstituteTarget] = useState(null); // { user_id, team_id, name }
  
  // Field Player Quick Action Modal (when clicking player on the tactical pitch)
  const [fieldActionPlayer, setFieldActionPlayer] = useState(null);

  // Cinematic Team Draft Animation state
  const [draftAnim, setDraftAnim] = useState(null);

  // Match Edit & Add Player
  const [editMatchModal, setEditMatchModal] = useState(false);
  const [matchEditForm, setMatchEditForm] = useState({ date: '', time: '', location: '', opponent: '' });
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(null); // holds teamId

  // Tactical Pitch Tab: 'both' | 0 | 1
  const [pitchTab, setPitchTab] = useState('both');

  // Player Stats & History Modal State
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  const normalizeStr = str => (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const isMyPlayer = (p) => {
    if (!user || !p) return false;
    if (user.id && p.id && String(p.id) === String(user.id)) return true;
    if (user.username && p.username && normalizeStr(p.username) === normalizeStr(user.username)) return true;
    if (user.nickname && p.nickname && normalizeStr(user.nickname).length >= 2) {
      const uNick = normalizeStr(user.nickname);
      const pNick = normalizeStr(p.nickname);
      if (pNick.split(',').map(s => s.trim()).includes(uNick)) return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedPlayerModal && selectedPlayerModal.id) {
      setPlayerHistoryLoading(true);
      fetch(`${API_URL}/users/${selectedPlayerModal.id}/history`)
        .then(res => res.json())
        .then(data => {
          setPlayerHistory(Array.isArray(data) ? data : []);
        })
        .catch(err => {
          console.error('Erro ao carregar histórico do jogador:', err);
          setPlayerHistory([]);
        })
        .finally(() => setPlayerHistoryLoading(false));
    } else {
      setPlayerHistory([]);
    }
  }, [selectedPlayerModal]);

  const openPlayerDetails = (p) => {
    const fullP = allPlayers.find(ap => ap.id === p.id) || p;
    setSelectedPlayerModal(fullP);
  };

  const cardRef = useRef(null);

  // Recarrega as notas que este usuário já enviou, para ele conseguir corrigir
  // dentro do prazo em vez de começar do zero.
  const minhasNotasSalvas = match && match.my_ratings ? JSON.stringify(match.my_ratings) : '';
  useEffect(() => {
    if (minhasNotasSalvas) setRatings(JSON.parse(minhasNotasSalvas));
  }, [minhasNotasSalvas]);

  // Timers de debounce dos inputs de gols/assistencias.
  // IMPORTANTE: precisa ficar aqui em cima, junto dos outros hooks. Se for declarado
  // depois do "if (!match) return ..." abaixo, o React roda uma quantidade diferente
  // de hooks entre o estado de carregamento e o carregado (erro #310).
  const eventDebounceRef = useRef({});

  // Limpa os timers pendentes ao sair da tela, evitando fetch e setState orfaos
  useEffect(() => {
    const timers = eventDebounceRef.current;
    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, []);

  const loadMatch = () => {
    // O id vai no cabeçalho para o backend devolver as notas que EU já dei
    fetch(`${API_URL}/matches/${id}`, { headers: authHeaders(user) })
      .then(res => res.json())
      .then(data => {
        setMatch(data);
      });
  };

  const loadPlayers = () => {
    fetch(`${API_URL}/stats`)
      .then(res => res.json())
      .then(data => setAllPlayers(data));
  };

  useEffect(() => {
    loadMatch();
    loadPlayers();
  }, [id]);

  if (!match) return <div className="text-center mt-10 text-muted">Carregando dados da partida...</div>;

  const handleTogglePlayer = (playerId) => {
    if (selectedPlayers.includes(playerId)) {
      setSelectedPlayers(selectedPlayers.filter(p => p !== playerId));
    } else {
      setSelectedPlayers([...selectedPlayers, playerId]);
    }
  };

  // Contra rival não há sorteio: os convocados formam direto o nosso time
  const saveRivalLineup = async () => {
    if (selectedPlayers.length === 0) return;
    const res = await fetch(`${API_URL}/matches/${id}/teams`, {
      method: 'POST',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ teams: [{ name: 'plugshawty FC', playerIds: selectedPlayers }] })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Não foi possível salvar a escalação.');
      return;
    }
    loadMatch();
  };

  const generateTeamsAuto = async () => {
    const selected = allPlayers.filter(p => selectedPlayers.includes(p.id));
    if (selected.length === 0) return;

    // Ordena pelo OVR. Ele já chega evoluído pelo desempenho nas partidas (nota,
    // gols e assistências), então somar a nota média de novo aqui contaria o mesmo
    // desempenho duas vezes no equilíbrio dos times.
    selected.sort((a, b) => {
      const powerA = calcOVR(a);
      const powerB = calcOVR(b);
      return powerB - powerA;
    });

    const teamAIds = [];
    const teamBIds = [];
    const sequence = [];

    // Snake draft distribution
    selected.forEach((p, idx) => {
      const round = Math.floor(idx / 2);
      const isTeamA = round % 2 === 0 ? (idx % 2 === 0) : (idx % 2 !== 0);
      if (isTeamA) teamAIds.push(p.id);
      else teamBIds.push(p.id);

      sequence.push({
        player: p,
        teamName: isTeamA ? 'COM COLETE' : 'SEM COLETE',
        isTeamA
      });
    });

    // Save to backend in background
    const savePromise = fetch(`${API_URL}/matches/${id}/teams`, {
      method: 'POST',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        teams: [
          { name: 'COM COLETE', playerIds: teamAIds },
          { name: 'SEM COLETE', playerIds: teamBIds }
        ]
      })
    });

    // Start Phase 1: Shuffling
    setDraftAnim({
      stage: 'shuffling',
      sequence,
      teamA: [],
      teamB: [],
      revealedCount: 0,
      total: sequence.length
    });

    // Phase 1 -> Phase 2: Sequential Draft Reveal (after 1000ms)
    setTimeout(() => {
      setDraftAnim(prev => prev ? { ...prev, stage: 'revealing' } : null);

      let current = 0;
      const interval = setInterval(() => {
        current += 1;
        if (current <= sequence.length) {
          const item = sequence[current - 1];
          playDraftSound(260 + current * 20);

          setDraftAnim(prev => {
            if (!prev) return null;
            return {
              ...prev,
              revealedCount: current,
              teamA: item.isTeamA ? [...prev.teamA, item.player] : prev.teamA,
              teamB: !item.isTeamA ? [...prev.teamB, item.player] : prev.teamB
            };
          });
        }

        if (current >= sequence.length) {
          clearInterval(interval);
          // Phase 3: Celebration!
          setTimeout(async () => {
            await savePromise;
            playCelebrationSound();
            confetti({
              particleCount: 110,
              spread: 85,
              origin: { y: 0.55 },
              colors: ['#00f59b', '#fbbf24', '#00e5ff', '#ffffff']
            });

            setDraftAnim(prev => prev ? { ...prev, stage: 'done' } : null);
          }, 350);
        }
      }, 190);
    }, 1000);
  };

  // Direct score update for a team (without needing to assign goals to players)
  const handleUpdateTeamScore = async (teamId, val, inputEl) => {
    const num = parseInt(val, 10);
    const scoreVal = isNaN(num) ? 0 : Math.max(0, num);

    // Mesma correção dos campos de gol: evita o campo ficar mostrando "01"
    if (inputEl && inputEl.value !== String(scoreVal)) {
      inputEl.value = String(scoreVal);
    }

    // Optimistic local update
    setMatch(prev => {
      if (!prev) return prev;
      const updatedTeams = (prev.teams || []).map(t => 
        t.id === teamId ? { ...t, score: scoreVal, manual_score: scoreVal } : t
      );
      return { ...prev, teams: updatedTeams };
    });

    await fetch(`${API_URL}/matches/${id}/team-score`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ team_id: teamId, score: scoreVal })
    });
  };

  // Direct number of goals / assists update for a player (DEBOUNCED)
  const handleSetPlayerEventCount = (playerId, type, val, inputEl) => {
    const num = parseInt(val, 10);
    const countVal = isNaN(num) ? 0 : Math.max(0, num);

    // Digitar 1 em cima de um campo que ja mostrava 0 deixaria "01" na tela: o React
    // compara o valor do input com o novo de forma fraca e "01" == 1, entao ele nao
    // reescreve o campo sozinho. Aqui corrigimos o texto na hora.
    if (inputEl && inputEl.value !== String(countVal)) {
      inputEl.value = String(countVal);
    }

    // Optimistic local update — update match state immediately without API call
    setMatch(prev => {
      if (!prev) return prev;
      const eventKey = type === 'goal' ? 'goals' : 'assists';
      // Remove old events for this player
      const filtered = (prev[eventKey] || []).filter(e => e.user_id !== playerId);
      // Add new events
      for (let i = 0; i < countVal; i++) {
        filtered.push({ match_id: prev.id, user_id: playerId, id: -(Date.now() + i) });
      }
      return { ...prev, [eventKey]: filtered };
    });

    // Debounce the actual API call (wait 600ms after last keystroke)
    const debounceKey = `${playerId}-${type}`;
    if (eventDebounceRef.current[debounceKey]) {
      clearTimeout(eventDebounceRef.current[debounceKey]);
    }
    eventDebounceRef.current[debounceKey] = setTimeout(async () => {
      await fetch(`${API_URL}/matches/${id}/player-events`, {
        method: 'PUT',
        headers: authHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ user_id: playerId, type, count: countVal })
      });
      delete eventDebounceRef.current[debounceKey];
      // So recarrega do servidor quando nao ha mais nenhum input pendente, senao o
      // refetch sobrescreve o numero que o usuario ainda esta digitando em outro campo
      if (Object.keys(eventDebounceRef.current).length === 0) loadMatch();
    }, 600);
  };

  const removeEvent = async (type, eventId) => {
    await fetch(`${API_URL}/${type}/${eventId}`, { method: 'DELETE', headers: authHeaders(user) });
    loadMatch();
  };

  const handleDeleteMatch = async () => {
    if (window.confirm('Tem certeza que deseja excluir esta partida? Todos os gols, assistências e notas dela serão apagados permanentemente.')) {
      await fetch(`${API_URL}/matches/${id}`, { method: 'DELETE', headers: authHeaders(user) });
      navigate('/matches');
    }
  };

  const handleSwitchTeam = async (userId) => {
    await fetch(`${API_URL}/matches/${id}/switch-team`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId })
    });
    setFieldActionPlayer(null);
    loadMatch();
  };

  const handleReplacePlayer = async (oldUserId, newUserId) => {
    await fetch(`${API_URL}/matches/${id}/replace-player`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ old_user_id: oldUserId, new_user_id: newUserId })
    });
    setSubstituteTarget(null);
    setFieldActionPlayer(null);
    loadMatch();
  };

  const handleUpdateMatchInfo = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/matches/${id}`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(matchEditForm)
    });
    setEditMatchModal(false);
    loadMatch();
  };

  const handleAddPlayerToTeam = async (userId) => {
    await fetch(`${API_URL}/matches/${id}/add-player`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: userId, team_id: showAddPlayerModal })
    });
    setShowAddPlayerModal(null);
    loadMatch();
  };

  // Create player manually on this screen
  const handleCreateManualPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: authHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username: newPlayerName.trim(),
          nickname: newPlayerNickname.trim() || newPlayerName.trim(),
          position: newPlayerPosition
        })
      });
      const created = await res.json();
      if (created && created.id) {
        const playersRes = await fetch(`${API_URL}/stats`);
        const updatedPlayers = await playersRes.json();
        setAllPlayers(updatedPlayers);

        // If teams not created yet, add directly to convocação
        if (!teamsReady) {
          setSelectedPlayers(prev => Array.from(new Set([...prev, created.id])));
        }

        setNewPlayerName('');
        setNewPlayerNickname('');
        setNewPlayerPosition('MEI');
        setShowNewPlayerModal(false);
      }
    } catch (err) {
      console.error('Erro ao cadastrar atleta:', err);
      alert('Erro ao cadastrar atleta.');
    }
  };

  const submitRatings = async () => {
    const notas = Object.fromEntries(
      Object.entries(ratings).filter(([, nota]) => nota >= 0 && nota <= 10)
    );

    if (Object.keys(notas).length === 0) {
      alert('Dê pelo menos uma nota antes de enviar.');
      return;
    }

    const res = await fetch(`${API_URL}/ratings`, {
      method: 'POST',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ match_id: id, ratings: notas })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível enviar sua avaliação.');
      return;
    }

    alert(`Avaliação enviada! Você deu nota para ${data.saved} atleta(s). Dá para corrigir enquanto o prazo não terminar.`);
    setShowRating(false);
    loadMatch();
  };

  // Encerrar é o que abre o prazo de 12 horas para o pessoal avaliar
  const handleFinishMatch = async () => {
    const confirmado = window.confirm(
      'Encerrar a partida? A partir de agora quem jogou tem 12 horas para dar as notas, e a escalação fica travada para os demais.'
    );
    if (!confirmado) return;

    const res = await fetch(`${API_URL}/matches/${id}`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'completed' })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Não foi possível encerrar a partida.');
      return;
    }
    loadMatch();
  };

  // Reabrir serve para desfazer um encerramento por engano. O prazo é zerado e
  // volta a contar do zero no próximo encerramento.
  const handleReopenMatch = async () => {
    const confirmado = window.confirm(
      'Reabrir a partida? O prazo de avaliação é zerado e recomeça quando você encerrar de novo. As notas já enviadas são mantidas.'
    );
    if (!confirmado) return;

    const res = await fetch(`${API_URL}/matches/${id}`, {
      method: 'PUT',
      headers: authHeaders(user, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: 'scheduled' })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Não foi possível reabrir a partida.');
      return;
    }
    loadMatch();
  };

  const exportWhatsAppCard = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const node = cardRef.current;
      const width = node.offsetWidth;
      const height = node.offsetHeight;

      await waitForImages(node);

      const dataUrl = await toPng(node, { 
        cacheBust: false, 
        // Botoes de edicao existem so na tela: nao entram na arte compartilhada
        filter: (n) => !n.classList?.contains('no-export'),
        quality: 1,
        pixelRatio: 2, // Resolução Retina 2x ultra nítida para WhatsApp e celular
        backgroundColor: '#08090e',
        width: width,
        height: height,
        style: {
          margin: '0',
          transform: 'none',
          maxWidth: `${width}px`,
          width: `${width}px`,
          height: `${height}px`,
          left: '0',
          top: '0',
          position: 'static'
        }
      });
      const link = document.createElement('a');
      link.download = `escalacao-partida-${match.date}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao exportar imagem:', err);
      alert('Não foi possível gerar a imagem da escalação.');
    } finally {
      setIsExporting(false);
    }
  };

  // Confirm WhatsApp Convocação selection & auto-create non-existing players
  const handleApplyWhatsAppList = async (selectedItems = []) => {
    setIsCreatingFromWhatsApp(true);
    try {
      const matchedIds = selectedItems
        .filter(item => item.matchedPlayer)
        .map(item => item.matchedPlayer.id);

      const newItems = selectedItems.filter(item => !item.matchedPlayer && item.suggestedName && item.suggestedName.trim());

      const newlyCreatedIds = [];

      for (const item of newItems) {
        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: authHeaders(user, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            username: item.suggestedName.trim(),
            nickname: item.suggestedName.trim(),
            position: 'MEI'
          })
        });
        const created = await res.json();
        if (created && created.id) {
          newlyCreatedIds.push(created.id);
        }
      }

      // Reload roster from backend to reflect newly created athletes
      const playersRes = await fetch(`${API_URL}/stats`);
      const updatedPlayers = await playersRes.json();
      setAllPlayers(updatedPlayers);

      // Merge with currently selected players without duplicates
      const combined = Array.from(new Set([...selectedPlayers, ...matchedIds, ...newlyCreatedIds]));
      setSelectedPlayers(combined);
      setShowWhatsAppModal(false);
    } catch (err) {
      console.error('Erro ao processar lista do WhatsApp:', err);
      alert('Ocorreu um erro ao cadastrar novos atletas.');
    } finally {
      setIsCreatingFromWhatsApp(false);
    }
  };

  // Contra rival os dois times já existem desde a criação: o nosso e o adversário, que
  // nunca tem jogadores. A escalação só está pronta quando o nosso time recebeu atletas.
  const isRival = match.type === 'rival';
  const nossoTime = isRival ? (match.teams || []).find(t => !t.is_opponent) : null;
  const teamsReady = isRival
    ? !!(nossoTime && nossoTime.players.length > 0)
    : !!(match.teams && match.teams.length >= 2);
  // Times que aparecem com jogadores na tela: contra rival, só o nosso
  const timesEscalados = isRival ? (nossoTime ? [nossoTime] : []) : (match.teams || []);
  // Contra rival só existe o nosso time em campo, então não há o que alternar
  const abaDoCampo = isRival ? 'team0' : pitchTab;

  // Calculate team OVR averages
  const getTeamOVR = (team) => {
    if (!team || !team.players || team.players.length === 0) return 0;
    const sum = team.players.reduce((acc, p) => acc + calcOVR(p), 0);
    return Math.round(sum / team.players.length);
  };

  // IDs of all players currently playing in this match
  const matchPlayerIds = teamsReady ? match.teams.flatMap(t => t.players).map(p => p.id) : [];
  // Bench players available for replacement
  const benchPlayers = allPlayers.filter(p => !matchPlayerIds.includes(p.id));

  // Count goals and assists per player
  const getPlayerEventCount = (playerId, type) => {
    if (type === 'goals') return (match.goals || []).filter(g => g.user_id === playerId).length;
    if (type === 'assists') return (match.assists || []).filter(a => a.user_id === playerId).length;
    return 0;
  };

  const allMatchPlayers = teamsReady ? match.teams.flatMap(t => t.players) : [];

  // ---------------------------------------------------------------------------
  // Permissões e prazo de avaliação
  // ---------------------------------------------------------------------------
  const isAdmin = isAdminUser(user);
  const partidaEncerrada = match.status === 'completed';

  // Placar, gols, assistências e a agenda são só do administrador.
  const podeEditarPlacar = isAdmin;
  // A escalação fica livre para o grupo montar até o apito final.
  const podeMexerNaEscalacao = isAdmin || !partidaEncerrada;

  const euJoguei = !!(user && allMatchPlayers.some(p => p.id === user.id));
  const janelaAberta = !!match.rating_open;
  const podeAvaliar = partidaEncerrada && janelaAberta && euJoguei;
  const jaAvaliei = !!(match.my_ratings && Object.keys(match.my_ratings).length > 0);
  const quantosAvaliaram = (match.raters || []).length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      
      {/* Top Bar with Back, Create Player and Delete Match */}
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <Link to="/matches" style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', fontWeight: '600' }}>
          <ArrowLeft size={18} /> Voltar para Histórico
        </Link>

        <div className="flex gap-3 items-center">
          <button 
            onClick={() => setShowNewPlayerModal(true)}
            className="btn"
            style={{ width: 'auto', padding: '9px 18px', fontSize: '0.85rem', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <UserPlus size={16} /> + Novo Jogador
          </button>

          <button 
            onClick={handleDeleteMatch}
            hidden={!isAdmin}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '9px 18px', fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Trash2 size={16} /> Excluir Partida
          </button>
        </div>
      </div>

      {/* Header Match Score Banner (Symmetrical 3-Column Flex with generous padding) */}
      <div className="glass-card" style={{ padding: '24px 18px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(20,22,34,0.92), rgba(10,32,18,0.9))', borderRadius: '22px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '14px' }}>
          PARTIDA DE {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        {teamsReady ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            gap: '10px', 
            maxWidth: '800px', 
            margin: '0 auto 12px' 
          }}>
            {/* Left: Time 1 */}
            <div style={{ flex: '1 1 0', textAlign: 'center', minWidth: 0 }}>
              <div className="font-extrabold" style={{ color: '#00f59b', fontSize: 'clamp(1rem, 3.8vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="desktop-only">{match.teams[0]?.name || 'SEM COLETE'}</span>
                <span className="mobile-only">{formatShortTeamName(match.teams[0]?.name || 'SEM COLETE')}</span>
              </div>
              <div className="text-muted text-xs font-bold uppercase tracking-wider mt-1">
                OVR {getTeamOVR(match.teams[0])}
              </div>
            </div>
            
            {/* Center: Interactive Scoreboard */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', flexShrink: 0 }}>
              <input 
                type="number" 
                min="0" 
                value={match.teams[0]?.score ?? 0} 
                onFocus={e => e.target.select()}
                onChange={e => handleUpdateTeamScore(match.teams[0].id, e.target.value, e.target)}
                disabled={!podeEditarPlacar}
                title="Alterar placar time 1"
                style={{ 
                  width: '54px', 
                  height: '52px', 
                  textAlign: 'center', 
                  fontSize: '1.8rem', 
                  fontWeight: '900', 
                  background: 'rgba(0,0,0,0.7)', 
                  border: '2px solid #00f59b', 
                  borderRadius: '14px', 
                  color: '#00f59b', 
                  padding: 0, 
                  margin: 0,
                  boxSizing: 'border-box'
                }} 
              />
              <span style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--text-muted)' }}>x</span>
              <input 
                type="number" 
                min="0" 
                value={match.teams[1]?.score ?? 0} 
                onFocus={e => e.target.select()}
                onChange={e => handleUpdateTeamScore(match.teams[1].id, e.target.value, e.target)}
                disabled={!podeEditarPlacar}
                title="Alterar placar time 2"
                style={{ 
                  width: '54px', 
                  height: '52px', 
                  textAlign: 'center', 
                  fontSize: '1.8rem', 
                  fontWeight: '900', 
                  background: 'rgba(0,0,0,0.7)', 
                  border: '2px solid #ffffff', 
                  borderRadius: '14px', 
                  color: '#ffffff', 
                  padding: 0, 
                  margin: 0,
                  boxSizing: 'border-box'
                }} 
              />
            </div>

            {/* Right: Time 2 */}
            <div style={{ flex: '1 1 0', textAlign: 'center', minWidth: 0 }}>
              <div className="font-extrabold" style={{ color: '#ffffff', fontSize: 'clamp(1rem, 3.8vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="desktop-only">{match.teams[1]?.name || 'COM COLETE'}</span>
                <span className="mobile-only">{formatShortTeamName(match.teams[1]?.name || 'COM COLETE')}</span>
              </div>
              <div className="text-muted text-xs font-bold uppercase tracking-wider mt-1">
                {isRival ? 'Adversário' : `OVR ${getTeamOVR(match.teams[1])}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted text-base my-3">{isRival ? `Jogo contra ${match.opponent} — escale o time abaixo!` : 'Times a definir — faça a convocação e sorteie as equipes abaixo!'}</div>
        )}

        <div className="flex justify-center gap-3 mt-4">
          <span style={{ 
            background: match.status === 'completed' ? 'rgba(0, 245, 155, 0.2)' : 'rgba(251, 191, 36, 0.2)', 
            color: match.status === 'completed' ? 'var(--primary)' : '#fbbf24', 
            border: `1px solid ${match.status === 'completed' ? 'rgba(0, 245, 155, 0.4)' : 'rgba(251, 191, 36, 0.4)'}`,
            padding: '6px 20px', 
            borderRadius: '20px', 
            fontWeight: 'bold', 
            fontSize: '0.82rem' 
          }}>
            {match.status === 'completed' ? <><CheckCircle2 size={14} style={{ marginRight: '5px' }} />Partida Encerrada</> : <><Clock size={14} style={{ marginRight: '5px' }} />Convocação & Em Andamento</>}
          </span>
        </div>
      </div>
      
      {/* 1. Convocação dos Jogadores */}
      {!teamsReady && (
        <div className="glass-card" style={{ padding: '20px 16px', marginBottom: '24px' }}>
          {/* Top: Textos da Convocação no Topo */}
          <div style={{ marginBottom: '16px' }}>
            <h3 className="font-extrabold text-xl text-main flex items-center gap-2" style={{ margin: '0 0 6px' }}>
              <Users color="var(--primary)" size={22} /> 1. Convocação dos Jogadores
            </h3>
            <p className="text-muted text-sm" style={{ margin: 0, lineHeight: 1.4 }}>
              {isRival ? 'Selecione os atletas que vão entrar em campo ou cole a lista rápida do grupo.' : 'Selecione os atletas confirmados para o sorteio ou cole a lista rápida do grupo.'}
            </p>
          </div>

          {/* Middle: Botões de Ação Abaixo do Texto (100% na tela e clicáveis) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '22px' }}>
            {/* WhatsApp Import Button */}
            <button 
              className="btn btn-secondary" 
              style={{ 
                padding: '12px 14px', 
                fontSize: '0.86rem', 
                fontWeight: '800',
                color: '#25D366', 
                borderColor: 'rgba(37, 211, 102, 0.5)', 
                background: 'rgba(37, 211, 102, 0.12)', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                borderRadius: '12px'
              }}
              onClick={() => setShowWhatsAppModal(true)}
            >
              <Clipboard size={18} /> Colar Lista do WhatsApp
            </button>

            {/* Manual Player Quick Add */}
            <button 
              className="btn btn-secondary" 
              style={{ 
                padding: '12px 14px', 
                fontSize: '0.86rem', 
                fontWeight: '700',
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                borderRadius: '12px'
              }}
              onClick={() => setShowNewPlayerModal(true)}
            >
              <Plus size={18} /> Criar Atleta
            </button>
          </div>

          {/* Grid de Atletas Convocados: 2 colunas perfeitas no celular */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '28px' }}>
            {allPlayers.map(p => {
              const isSelected = selectedPlayers.includes(p.id);
              const displayName = getPrimaryName(p);

              return (
                <div 
                  key={p.id} 
                  onClick={() => handleTogglePlayer(p.id)}
                  style={{
                    padding: '12px 10px', 
                    borderRadius: '14px', 
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(0, 245, 155, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 0 14px rgba(0, 245, 155, 0.25)' : 'none'
                  }}
                >
                  <div className="font-extrabold text-main" style={{ fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {displayName}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    <span style={{ color: isSelected ? 'var(--primary)' : 'inherit', fontWeight: isSelected ? 800 : 600 }}>{p.position || 'MEI'}</span> • OVR {calcOVR(p)}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div style={{ paddingTop: '28px', borderTop: '1px solid var(--border)' }}>
            <h4 className="font-extrabold text-lg text-main flex items-center gap-2 mb-3">
              {isRival ? <><Swords color="var(--primary)" size={20} /> 2. Escalação contra {match.opponent}</> : <><Shuffle color="var(--primary)" size={20} /> 2. Sorteio Ponderado por OVR (COM COLETE vs SEM COLETE)</>}
            </h4>
            <p className="text-muted text-xs mb-4">
              {isRival ? 'Todos os convocados formam o time do plugshawty FC. Dá para ajustar a escalação depois.' : 'O algoritmo equilibra automaticamente os dois times pelo OVR de cada atleta, que já reflete o desempenho nas partidas.'}
            </p>
            <button className="btn py-4 text-base font-extrabold w-full" onClick={isRival ? saveRivalLineup : generateTeamsAuto} disabled={selectedPlayers.length === 0 || !podeMexerNaEscalacao} style={{ borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {isRival ? <><Swords size={20} /> Confirmar Escalação ({selectedPlayers.length} Atletas)</> : <><Shuffle size={20} /> Sortear Equipes Equilibradas ({selectedPlayers.length} Convocados)</>}
            </button>
          </div>
        </div>
      )}

      {/* Manual New Player Modal */}
      {showNewPlayerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-extrabold text-lg text-main flex items-center gap-2">
                <UserPlus color="var(--primary)" size={20} /> Cadastrar Novo Atleta
              </h3>
              <button onClick={() => setShowNewPlayerModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateManualPlayer}>
              <div className="mb-4">
                <label className="label text-xs font-bold">Nome Completo</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ex: João da Silva" 
                  value={newPlayerName} 
                  onChange={e => setNewPlayerName(e.target.value)} 
                  required 
                  style={{ marginBottom: 0 }}
                />
              </div>

              <div className="mb-4">
                <label className="label text-xs font-bold">Apelido Principal de Jogo (Opcional)</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ex: Mursilha Jr, Caça Rato, Olise" 
                  value={newPlayerNickname} 
                  onChange={e => setNewPlayerNickname(e.target.value)} 
                  style={{ marginBottom: 0 }}
                />
              </div>

              <div className="mb-6">
                <label className="label text-xs font-bold">Posição de Jogo</label>
                <select 
                  className="input" 
                  value={newPlayerPosition} 
                  onChange={e => setNewPlayerPosition(e.target.value)}
                  style={{ marginBottom: 0, height: '42px' }}
                >
                  <option value="GOL">GOL — Goleiro</option>
                  <option value="ZAG">ZAG — Zagueiro</option>
                  <option value="LAT">LAT — Lateral</option>
                  <option value="VOL">VOL — Volante</option>
                  <option value="MEI">MEI — Meio-Campo</option>
                  <option value="ATA">ATA — Atacante</option>
                </select>
              </div>

              <div className="flex gap-3">
                <button type="submit" className="btn flex-1">Cadastrar Atleta</button>
                <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowNewPlayerModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Convocação Modal */}
      <WhatsAppImportModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        playersList={allPlayers}
        onApply={handleApplyWhatsAppList}
        isSubmitting={isCreatingFromWhatsApp}
      />

      {/* Teams Ready: Lineup List & Tactical Pitch View */}
      {teamsReady && !showRating && (
        <>
          {/* Header Controls: View Switcher Separado da Barra de Ações */}
          <div style={{ marginTop: '24px', marginBottom: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Linha 1: Seletor de Modo de Visualização (Abas) */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div 
                style={{ 
                  display: 'flex', 
                  gap: '8px',
                  background: 'rgba(14, 16, 23, 0.92)', 
                  padding: '6px', 
                  borderRadius: '16px', 
                  border: '1px solid var(--border)',
                  width: '100%',
                  maxWidth: '440px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                }}
              >
                <button 
                  className={`btn ${viewMode === 'list' ? '' : 'btn-secondary'}`} 
                  style={{ 
                    padding: '11px 16px', 
                    fontSize: '0.84rem', 
                    flex: 1, 
                    borderRadius: '12px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '8px',
                    fontWeight: viewMode === 'list' ? '800' : '600'
                  }} 
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList size={16} /> Lista Detalhada
                </button>
                <button 
                  className={`btn ${viewMode === 'pitch' ? '' : 'btn-secondary'}`} 
                  style={{ 
                    padding: '11px 16px', 
                    fontSize: '0.84rem', 
                    flex: 1, 
                    borderRadius: '12px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '8px',
                    fontWeight: viewMode === 'pitch' ? '800' : '600'
                  }} 
                  onClick={() => setViewMode('pitch')}
                >
                  <MapPin size={16} /> Campo Tático
                </button>
              </div>
            </div>

            {/* Linha 2: Seletor de Time no Campo Tático (Fora da exportação da imagem) */}
            {viewMode === 'pitch' && !isRival && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  onClick={() => setPitchTab('both')}
                  className={`btn ${pitchTab === 'both' ? '' : 'btn-secondary'}`}
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '0.82rem', 
                    borderRadius: '12px',
                    fontWeight: pitchTab === 'both' ? '800' : '600'
                  }}
                >
                  Ambos os Times
                </button>

                <button 
                  type="button"
                  onClick={() => setPitchTab('team0')}
                  className={`btn ${pitchTab === 'team0' ? '' : 'btn-secondary'}`}
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '0.82rem', 
                    borderRadius: '12px',
                    fontWeight: pitchTab === 'team0' ? '800' : '600',
                    borderColor: pitchTab === 'team0' ? '#00f59b' : 'rgba(0, 245, 155, 0.35)',
                    color: pitchTab === 'team0' ? '#07080c' : '#00f59b',
                    background: pitchTab === 'team0' ? '#00f59b' : 'rgba(0, 245, 155, 0.08)'
                  }}
                >
                  {match.teams[0]?.name || 'COM COLETE'} (OVR {getTeamOVR(match.teams[0])})
                </button>

                <button 
                  type="button"
                  onClick={() => setPitchTab('team1')}
                  className={`btn ${pitchTab === 'team1' ? '' : 'btn-secondary'}`}
                  style={{ 
                    padding: '8px 16px', 
                    fontSize: '0.82rem', 
                    borderRadius: '12px',
                    fontWeight: pitchTab === 'team1' ? '800' : '600',
                    borderColor: pitchTab === 'team1' ? '#ffffff' : 'rgba(255, 255, 255, 0.35)',
                    color: pitchTab === 'team1' ? '#07080c' : '#ffffff',
                    background: pitchTab === 'team1' ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  {match.teams[1]?.name || 'SEM COLETE'} (OVR {getTeamOVR(match.teams[1])})
                </button>
              </div>
            )}

            {/* Linha 3: Ação de Exportar para WhatsApp (Dedicado e 100% visível em qualquer celular) */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary" 
                style={{ 
                  width: '100%', 
                  maxWidth: '440px',
                  padding: '12px 18px', 
                  fontSize: '0.86rem', 
                  fontWeight: '800', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px', 
                  borderRadius: '14px',
                  borderColor: 'rgba(0, 245, 155, 0.45)',
                  background: 'rgba(0, 245, 155, 0.08)',
                  color: '#00f59b',
                  boxShadow: '0 0 16px rgba(0, 245, 155, 0.15)'
                }} 
                onClick={exportWhatsAppCard} 
                disabled={isExporting}
              >
                <Share2 size={18} /> {isExporting ? 'Baixando Imagem...' : 'Exportar Escalação (WhatsApp)'}
              </button>
            </div>
          </div>

          <div ref={cardRef} style={{ maxWidth: viewMode === 'pitch' ? '540px' : '960px', width: '100%', margin: '0 auto', padding: '24px 14px 20px', background: '#08090e', borderRadius: '0px', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--primary)', fontWeight: '900', fontSize: '1.35rem', margin: 0, letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                {isRival ? `plugshawty FC x ${match.opponent}` : 'Escalação Oficial da Partida'}
              </h4>
              <div style={{ color: '#ffffff', fontSize: '0.88rem', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR')} — {match.time || '15h'} — {match.location || 'Arena Petrópolis'}
                <button 
                  onClick={() => {
                    setMatchEditForm({ date: match.date || '', time: match.time || '', location: match.location || '', opponent: match.opponent || '' });
                    setEditMatchModal(true);
                  }}
                  hidden={!isAdmin}
                  className="no-export"
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
                  title="Editar Partida"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>

            {/* VIEW MODE TRANSITION */}
            <AnimatePresence mode="wait">
              {viewMode === 'list' ? (
                <motion.div 
                  key="list-view"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.28 }}
                  style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '16px' }}
                >
                {timesEscalados.map((team, idx) => (
                  <div 
                    key={team.id} 
                    className="glass-card" 
                    style={{ 
                      position: 'relative', 
                      overflow: 'hidden', 
                      padding: '18px 14px',
                      borderRadius: '20px',
                      borderColor: idx === 0 ? 'rgba(0, 245, 155, 0.4)' : 'rgba(255, 255, 255, 0.25)',
                      background: idx === 0 ? 'rgba(0, 245, 155, 0.04)' : 'rgba(255, 255, 255, 0.03)'
                    }}
                  >
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: idx === 0 ? '#00f59b' : '#ffffff' }}></div>
                    
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-extrabold text-lg" style={{ color: idx === 0 ? '#00f59b' : '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Shield size={20} /> {team.name}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => setShowAddPlayerModal(team.id)} 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 8px', fontSize: '0.70rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', minWidth: 'auto', width: 'auto' }}
                          title="Adicionar jogador a este time"
                          hidden={!podeMexerNaEscalacao}
                        >
                          <Plus size={14} /> JOGADOR
                        </button>
                        <span className="badge" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', fontSize: '0.78rem', padding: '4px 10px', margin: 0 }}>
                          OVR Médio: {getTeamOVR(team)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Player rows with 100% visible name and clean touch controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {team.players.map(p => {
                        const gCount = getPlayerEventCount(p.id, 'goals');
                        const aCount = getPlayerEventCount(p.id, 'assists');
                        const displayName = getPrimaryName(p);

                        return (
                          <div 
                            key={p.id} 
                            onClick={() => openPlayerDetails(p)}
                            style={{ 
                              padding: '12px 12px', 
                              background: 'rgba(255,255,255,0.03)', 
                              borderRadius: '14px', 
                              border: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              cursor: 'pointer',
                              transition: 'background 0.15s, border-color 0.15s'
                            }}
                            title="Toque no card para ver estatísticas e histórico"
                          >
                            {/* Linha 1: Avatar + Nome Completo + Posição e Botões de Ação */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, padding: '2px 0' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--secondary)', overflow: 'hidden', flexShrink: 0, border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {p.photo ? (
                                    <img src={formatPhotoUrl(p.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                      {p.username.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div className="font-extrabold text-main" style={{ fontSize: '0.94rem', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {displayName}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{p.position || 'MEI'}</span>
                                    <span>•</span>
                                    <span>OVR {calcOVR(p)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Botões de Ação Rápida: Trocar de Time & Substituir */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }} 
                                  title="Trocar de time (COM COLETE ⇄ SEM COLETE)" 
                                  hidden={isRival}
                                  onClick={(e) => { e.stopPropagation(); handleSwitchTeam(p.id); }}
                                  disabled={!podeMexerNaEscalacao}
                                >
                                  <RefreshCw size={14} />
                                </button>

                                <button 
                                  className="btn btn-secondary" 
                                  style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }} 
                                  title="Substituir por outro atleta do elenco" 
                                  onClick={(e) => { e.stopPropagation(); setSubstituteTarget({ user_id: p.id, name: displayName, team_name: team.name }); }}
                                  disabled={!podeMexerNaEscalacao}
                                >
                                  <UserPlus size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Linha 2: Contadores de Gols e Assistências Claros e Espaçosos */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }} onClick={e => e.stopPropagation()}>
                              {/* Goals Counter Pill with ⚽ Emoji lado a lado */}
                              <div 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between',
                                  gap: '6px', 
                                  background: 'rgba(0, 245, 155, 0.08)', 
                                  border: '1px solid rgba(0, 245, 155, 0.3)', 
                                  borderRadius: '10px', 
                                  padding: '4px 10px',
                                  height: '38px',
                                  flex: 1,
                                  minWidth: 0
                                }} 
                                title="Gols marcados pelo atleta"
                              >
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  <Goal size={14} />
                                  <span>Gols</span>
                                </span>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="30"
                                  value={gCount}
                                  onFocus={e => e.target.select()}
                                  onChange={e => handleSetPlayerEventCount(p.id, 'goal', e.target.value, e.target)}
                                  disabled={!podeEditarPlacar}
                                  style={{ 
                                    width: '32px', 
                                    height: '28px', 
                                    textAlign: 'center', 
                                    fontSize: '1rem', 
                                    fontWeight: '900', 
                                    background: 'rgba(0,0,0,0.4)', 
                                    borderRadius: '6px',
                                    border: '1px solid rgba(0, 245, 155, 0.3)', 
                                    color: 'var(--primary)', 
                                    padding: 0, 
                                    margin: 0,
                                    outline: 'none',
                                    flexShrink: 0
                                  }}
                                />
                              </div>

                              {/* Assists Counter Pill with 👟 Emoji e palavra lado a lado */}
                              <div 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between',
                                  gap: '6px', 
                                  background: 'rgba(251, 191, 36, 0.08)', 
                                  border: '1px solid rgba(251, 191, 36, 0.3)', 
                                  borderRadius: '10px', 
                                  padding: '4px 10px',
                                  height: '38px',
                                  flex: 1,
                                  minWidth: 0
                                }} 
                                title="Assistências do atleta"
                              >
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  <Footprints size={14} />
                                  <span>Assist.</span>
                                </span>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="30"
                                  value={aCount}
                                  onFocus={e => e.target.select()}
                                  onChange={e => handleSetPlayerEventCount(p.id, 'assist', e.target.value, e.target)}
                                  disabled={!podeEditarPlacar}
                                  style={{ 
                                    width: '32px', 
                                    height: '28px', 
                                    textAlign: 'center', 
                                    fontSize: '1rem', 
                                    fontWeight: '900', 
                                    background: 'rgba(0,0,0,0.4)', 
                                    borderRadius: '6px',
                                    border: '1px solid rgba(251, 191, 36, 0.3)', 
                                    color: '#fbbf24', 
                                    padding: 0, 
                                    margin: 0,
                                    outline: 'none',
                                    flexShrink: 0
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              /* 2. TACTICAL SOCCER PITCH VIEW - EA SPORTS FC 24 BROADCAST STYLE */
              <TacticalPitch
                match={match}
                abaDoCampo={abaDoCampo}
                onPlayerClick={openPlayerDetails}
                getPlayerEventCount={getPlayerEventCount}
                getTeamOVR={getTeamOVR}
              />
            )}
          </AnimatePresence>

          {/* Rodapé Oficial de Matchday (Alinhamento perfeito, sem quebra de ponto) */}
          <div 
            style={{ 
              marginTop: '14px', 
              paddingTop: '10px', 
              borderTop: '1px solid rgba(255, 255, 255, 0.08)', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '4px',
              fontSize: '0.68rem',
              fontWeight: '800',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              textAlign: 'center'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--primary)', fontWeight: '900' }}>PLUGSHAWTYCAFETOES FC</span>
              <span style={{ opacity: 0.35, fontSize: '0.62rem' }}>•</span>
              <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>TEMPORADA 2026</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.64rem', color: 'rgba(255, 255, 255, 0.45)', whiteSpace: 'nowrap' }}>
              <span>{isRival ? `VS ${match.opponent}` : (match.teams && match.teams[0]?.players && match.teams[1]?.players ? `${match.teams[0].players.length} VS ${match.teams[1].players.length}` : '')}</span>
              <span style={{ opacity: 0.35, fontSize: '0.62rem' }}>•</span>
              <span style={{ color: '#ffffff', fontWeight: '900' }}>MATCHDAY OFICIAL</span>
            </div>
          </div>
        </div>

        {/* Dica para o usuário (Apenas na tela, fora da imagem exportada) */}
        {viewMode === 'pitch' && (
          <div style={{ textAlign: 'left', marginTop: '14px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '10px', padding: '0 10px' }}>
            <Lightbulb size={24} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} /> 
            <span>Toque em qualquer atleta no campo para ver suas estatísticas completas, OVR e histórico da temporada.</span>
          </div>
        )}

        {/* Resumo de Gols e Assistências da Partida (Apenas na tela, fora da imagem exportada) */}
        {match.goals && match.goals.length > 0 && (
          <div className="mt-8 pt-5 border-t border-border">
            <h5 className="font-extrabold mb-3 flex items-center gap-2 text-primary" style={{ fontSize: '0.95rem' }}><Goal size={18} /> Gols Registrados na Partida ({match.goals.length})</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {match.goals.map((g) => (
                <span key={g.id} style={{ background: 'rgba(0,245,155,0.1)', padding: '5px 12px', borderRadius: '12px', fontSize: '0.82rem', border: '1px solid rgba(0,245,155,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Goal size={13} color="var(--primary)" /> <strong>{getPrimaryName(g)}</strong>
                  {match.status !== 'completed' && (
                    <button 
                      onClick={() => removeEvent('goals', g.id)}
                      title="Excluir este gol"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Match Assists Timeline Summary */}
        {match.assists && match.assists.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <h5 className="font-extrabold mb-3 flex items-center gap-2 text-yellow-400" style={{ fontSize: '0.95rem' }}><Award size={18} /> Assistências Registradas na Partida ({match.assists.length})</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {match.assists.map((a) => (
                <span key={a.id} style={{ background: 'rgba(251,191,36,0.1)', padding: '5px 12px', borderRadius: '12px', fontSize: '0.82rem', border: '1px solid rgba(251,191,36,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Footprints size={13} color="#fbbf24" /> <strong>{getPrimaryName(a)}</strong>
                  {match.status !== 'completed' && (
                    <button 
                      onClick={() => removeEvent('assists', a.id)}
                      title="Excluir esta assistência"
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0 2px', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
          
          {/* Encerramento da partida e prazo de avaliação */}
          {!showRating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '28px' }}
            >
              {/* Partida ainda em aberto */}
              {!partidaEncerrada && (isAdmin ? (
                <button
                  className="btn py-4 text-lg font-extrabold"
                  style={{ width: '100%', maxWidth: '440px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 20px rgba(0, 245, 155, 0.25)' }}
                  onClick={handleFinishMatch}
                >
                  <CheckCircle2 size={22} /> Encerrar Partida & Abrir Avaliação
                </button>
              ) : (
                <div className="text-center text-muted" style={{ fontSize: '0.84rem', maxWidth: '440px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={15} /> As notas abrem quando o administrador encerrar a partida.
                </div>
              ))}

              {/* Partida encerrada, prazo correndo */}
              {partidaEncerrada && janelaAberta && (
                <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '16px', borderColor: 'rgba(251, 191, 36, 0.4)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} /> Avaliações abertas por mais <ContadorPrazo terminaEm={match.rating_ends_at} agoraServidor={match.server_now} />
                  </div>

                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {quantosAvaliaram} de {allMatchPlayers.length} atletas já avaliaram
                  </div>

                  {euJoguei ? (
                    <button
                      className="btn py-3 font-extrabold"
                      style={{ width: '100%', marginTop: '12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => setShowRating(true)}
                    >
                      <Star size={18} fill="#000" /> {jaAvaliei ? 'Revisar minha avaliação' : 'Avaliar os atletas'}
                    </button>
                  ) : (
                    <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '10px' }}>
                      Só quem entrou em campo nesta partida pode dar notas.
                    </div>
                  )}
                </div>
              )}

              {/* Partida encerrada e prazo vencido */}
              {partidaEncerrada && !janelaAberta && (
                <div className="text-center text-muted" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={15} /> Partida encerrada. O prazo de avaliação já passou
                  {quantosAvaliaram > 0 && ` — ${quantosAvaliaram} atleta(s) avaliaram`}.
                </div>
              )}

              {/* Desfazer um encerramento por engano */}
              {isAdmin && partidaEncerrada && (
                <button
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '8px 16px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={handleReopenMatch}
                >
                  <RefreshCw size={14} /> Reabrir partida
                </button>
              )}
            </motion.div>
          )}
        </>
      )}

      {/* Field Player Quick Action Modal (when clicking player on the tactical pitch) */}
      {fieldActionPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '380px', padding: '26px', textAlign: 'center' }}>
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-extrabold text-lg text-main" style={{ margin: 0 }}>{getPrimaryName(fieldActionPlayer.player)}</h4>
              <button onClick={() => setFieldActionPlayer(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              {fieldActionPlayer.teamName} • {fieldActionPlayer.player.position || 'MEI'}
            </div>

            {/* Quick Number Inputs for Field Player */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Goal size={14} /> Gols:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="30"
                  value={getPlayerEventCount(fieldActionPlayer.player.id, 'goals')}
                  disabled={!podeEditarPlacar}
                  onFocus={e => e.target.select()}
                  onChange={e => handleSetPlayerEventCount(fieldActionPlayer.player.id, 'goal', e.target.value, e.target)}
                  style={{ width: '48px', height: '34px', textAlign: 'center', fontSize: '0.9rem', fontWeight: '800', background: 'rgba(0, 245, 155, 0.12)', border: '1px solid rgba(0, 245, 155, 0.4)', borderRadius: '8px', color: 'var(--primary)', padding: 0, margin: 0 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Footprints size={14} /> Assist.:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="30"
                  value={getPlayerEventCount(fieldActionPlayer.player.id, 'assists')}
                  disabled={!podeEditarPlacar}
                  onFocus={e => e.target.select()}
                  onChange={e => handleSetPlayerEventCount(fieldActionPlayer.player.id, 'assist', e.target.value, e.target)}
                  style={{ width: '48px', height: '34px', textAlign: 'center', fontSize: '0.9rem', fontWeight: '800', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: '8px', color: '#fbbf24', padding: 0, margin: 0 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn btn-secondary" hidden={!podeMexerNaEscalacao || isRival} onClick={() => handleSwitchTeam(fieldActionPlayer.player.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <RefreshCw size={15} /> Trocar de Equipe
              </button>
              <button className="btn btn-secondary" hidden={!podeMexerNaEscalacao} onClick={() => {
                setSubstituteTarget({ user_id: fieldActionPlayer.player.id, name: getPrimaryName(fieldActionPlayer.player) });
                setFieldActionPlayer(null);
              }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <UserPlus size={15} /> Substituir por Reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Match Modal */}
      {editMatchModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-sm p-6" style={{ background: '#0a0a0f' }}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-extrabold text-lg text-main" style={{ margin: 0 }}>Editar Partida</h4>
              <button onClick={() => setEditMatchModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleUpdateMatchInfo}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-muted mb-2">Data da Partida</label>
                <input type="date" className="input" required value={matchEditForm.date} onChange={e => setMatchEditForm({...matchEditForm, date: e.target.value})} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-muted mb-2">Horário</label>
                <input type="text" className="input" placeholder="ex: 15h, 19:30" required value={matchEditForm.time} onChange={e => setMatchEditForm({...matchEditForm, time: e.target.value})} />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-bold text-muted mb-2">Local / Arena</label>
                <input type="text" className="input" placeholder="ex: Arena Petrópolis" required value={matchEditForm.location} onChange={e => setMatchEditForm({...matchEditForm, location: e.target.value})} />
              </div>
              {isRival && (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-muted mb-2">Time Adversário</label>
                  <input type="text" className="input" placeholder="ex: Real Madruga FC" required maxLength={40} value={matchEditForm.opponent} onChange={e => setMatchEditForm({...matchEditForm, opponent: e.target.value})} />
                </div>
              )}
              <button type="submit" className="btn w-full">Salvar Alterações</button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Player to Team Modal */}
      {showAddPlayerModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full max-w-sm p-6" style={{ background: '#0a0a0f', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-extrabold text-lg text-main" style={{ margin: 0 }}>Adicionar Jogador</h4>
              <button onClick={() => setShowAddPlayerModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p className="text-muted text-xs mb-4">Selecione um jogador para entrar neste time:</p>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {allPlayers.filter(p => !allMatchPlayers.some(mp => mp.id === p.id)).length > 0 ? (
                allPlayers.filter(p => !allMatchPlayers.some(mp => mp.id === p.id)).map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleAddPlayerToTeam(p.id)}
                    style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    className="hover:border-primary"
                  >
                    <span className="font-bold text-sm">{getPrimaryName(p)}</span>
                    <span className="text-xs font-bold text-muted bg-white/5 px-2 py-1 rounded">OVR {calcOVR(p)}</span>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted text-sm py-4">Todos os jogadores já estão na partida.</div>
              )}
            </div>
            
            <button className="btn btn-secondary w-full mt-4" onClick={() => setShowAddPlayerModal(null)}>Cancelar</button>
          </motion.div>
        </div>
      )}

      {/* Substitute Player Modal */}
      {substituteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-main">Substituir {substituteTarget.name}</h3>
              <button onClick={() => setSubstituteTarget(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p className="text-muted text-xs mb-4">Escolha um jogador do elenco para entrar no lugar de <strong>{substituteTarget.name}</strong>:</p>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {benchPlayers.length > 0 ? (
                benchPlayers.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => handleReplacePlayer(substituteTarget.user_id, p.id)}
                    style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    className="hover:border-primary"
                  >
                    <div>
                      <span className="font-bold text-main">{getPrimaryName(p)}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{p.position || 'CM'}</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Entrar <ArrowRight size={13} /></span>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted text-sm py-4">Nenhum jogador reserva disponível fora da partida.</div>
              )}
            </div>

            <button className="btn btn-secondary w-full" onClick={() => setSubstituteTarget(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Vestiário (Avaliação da Partida) */}
      <RatingModal
        isOpen={showRating && podeAvaliar}
        onClose={() => setShowRating(false)}
        match={match}
        ratings={ratings}
        setRatings={setRatings}
        onSubmitRatings={submitRatings}
        jaAvaliei={jaAvaliei}
        user={user}
        getPlayerEventCount={getPlayerEventCount}
      />

      {/* Cinematic Draft Animation Modal */}
      <DraftAnimation
        draftAnim={draftAnim}
        onClose={() => {
          setDraftAnim(null);
          loadMatch();
        }}
      />

      {/* Modal de Estatísticas e Histórico do Atleta */}
      <PlayerDetailsModal
        isOpen={Boolean(selectedPlayerModal)}
        player={selectedPlayerModal}
        onClose={() => setSelectedPlayerModal(null)}
        playerHistory={playerHistory}
        playerHistoryLoading={playerHistoryLoading}
        isMyPlayer={isMyPlayer}
        isAdmin={isAdmin}
        onEdit={() => {
          setSelectedPlayerModal(null);
          navigate('/players', { state: { autoEdit: true } });
        }}
      />
    </motion.div>
  );
}
