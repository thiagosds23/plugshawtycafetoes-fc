import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Users, Shuffle, Star, Shield, ArrowLeft, Share2, Trophy, Goal, Award, Trash2, RefreshCw, UserPlus, UserCheck, X, CheckCircle2, Clipboard, Check, Sparkles, LayoutList, MapPin, Plus, Zap, Footprints, Lightbulb, Clock, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { calcOVR } from '../utils/ovr';
import { API_URL, formatPhotoUrl } from '../config';

// Web Audio API Sound Synthesizer (Zero-latency native gaming sounds)
function playDraftSound(pitch = 440) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

function playCelebrationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.38);
    });
  } catch (e) {}
}

// Helper to display only the primary nickname (or username)
export function getPrimaryName(player) {
  if (!player) return '';
  if (player.nickname && typeof player.nickname === 'string') {
    const first = player.nickname.split(',')[0].trim();
    if (first) return first;
  }
  return player.username || '';
}

export function formatShortTeamName(name) {
  if (!name) return '';
  const upper = String(name).toUpperCase();
  if (upper.includes('SEM')) return 'SEM';
  if (upper.includes('COM')) return 'COM';
  return name;
}

export function formatHeight(val) {
  if (val === null || val === undefined || val === '') return '';
  let str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return str;
  if (num > 3) return (num / 100).toFixed(2);
  return num.toFixed(2);
}

// Intelligent WhatsApp List Parser with Fuzzy Matching
function parseWhatsAppList(text, playersList) {
  if (!text) return [];

  const normalize = (str) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Common matchday header keywords to skip
  const headerKeywords = [
    'futebol', 'jogo', 'partida', 'sabado', 'domingo', 'segunda',
    'terca', 'quarta', 'quinta', 'sexta', 'arena', 'ginasio', 'campo',
    'quadra', 'mensalistas', 'convocados', 'lista', 'presenca', 'horario',
    'local', 'aviso', 'regras', 'confirmados', 'time', 'vs', 'valor', 'pix'
  ];

  const lines = text.split(/\r?\n/);
  const recognized = [];

  lines.forEach((rawLine) => {
    // Strip leading numbers, bullets, emojis
    let cleaned = rawLine
      .replace(/^[\s\d\.\-\*\•\)\:\#]+/, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (cleaned.length < 2) return;

    const normLine = normalize(cleaned);

    // Skip header lines
    const isHeader = headerKeywords.some(kw => normLine.startsWith(kw) || (normLine.includes(kw) && normLine.length > 20));
    if (isHeader) return;

    const lineWords = normLine.split(/\s+/).filter(w => w.length >= 2);

    let bestMatch = null;
    let highestScore = 0;

    playersList.forEach((player) => {
      const pNicknames = (player.nickname || '')
        .split(',')
        .map(n => normalize(n))
        .filter(Boolean);
      const pUser = normalize(player.username || '');
      const pNames = [...pNicknames, pUser].filter(Boolean);

      let score = 0;

      // 1. Exact match with username or any of the player's nicknames
      if (pNames.some(n => n === normLine)) {
        score = 100;
      }
      // 2. Line contains player username or any of the player's nicknames
      else if (pNames.some(n => n.length >= 3 && normLine.includes(n))) {
        score = 90;
      }
      // 3. Player name or any nickname contains line
      else if (pNames.some(n => n.length >= 3 && n.includes(normLine))) {
        score = 85;
      }
      // 4. Token matches with any token of username or any nickname
      else {
        const playerTokens = [
          ...pNicknames.flatMap(n => n.split(/\s+/)),
          ...pUser.split(/\s+/)
        ].filter(t => t.length >= 3);

        for (const lw of lineWords) {
          if (playerTokens.includes(lw)) {
            score = Math.max(score, 80);
          } else if (playerTokens.some(pt => pt.startsWith(lw) || lw.startsWith(pt))) {
            score = Math.max(score, 70);
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = player;
      }
    });

    recognized.push({
      originalLine: rawLine.trim(),
      cleanedText: cleaned,
      suggestedName: cleaned,
      matchedPlayer: highestScore >= 70 ? bestMatch : null,
      score: highestScore,
      isNew: highestScore < 70,
      selected: true
    });
  });

  return recognized;
}

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
  const [whatsAppText, setWhatsAppText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
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
  const [matchEditForm, setMatchEditForm] = useState({ date: '', time: '', location: '' });
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

  const loadMatch = () => {
    fetch(`${API_URL}/matches/${id}`)
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

  const generateTeamsAuto = async () => {
    const selected = allPlayers.filter(p => selectedPlayers.includes(p.id));
    if (selected.length === 0) return;

    // Sort descending by Effective Power: OVR + (avg_rating * 2)
    selected.sort((a, b) => {
      const powerA = calcOVR(a) + ((a.avg_rating || 0) * 2);
      const powerB = calcOVR(b) + ((b.avg_rating || 0) * 2);
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
      headers: { 'Content-Type': 'application/json' },
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
  const handleUpdateTeamScore = async (teamId, val) => {
    const num = parseInt(val, 10);
    const scoreVal = isNaN(num) ? 0 : Math.max(0, num);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId, score: scoreVal })
    });
  };

  // Direct number of goals / assists update for a player (DEBOUNCED)
  const eventDebounceRef = useRef({});
  const handleSetPlayerEventCount = (playerId, type, val) => {
    const num = parseInt(val, 10);
    const countVal = isNaN(num) ? 0 : Math.max(0, num);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: playerId, type, count: countVal })
      });
      // Sync with server after save
      loadMatch();
      delete eventDebounceRef.current[debounceKey];
    }, 600);
  };

  const removeEvent = async (type, eventId) => {
    await fetch(`${API_URL}/${type}/${eventId}`, { method: 'DELETE' });
    loadMatch();
  };

  const handleDeleteMatch = async () => {
    if (window.confirm('Tem certeza que deseja excluir esta partida? Todos os gols, assistências e notas dela serão apagados permanentemente.')) {
      await fetch(`${API_URL}/matches/${id}`, { method: 'DELETE' });
      navigate('/matches');
    }
  };

  const handleSwitchTeam = async (userId) => {
    await fetch(`${API_URL}/matches/${id}/switch-team`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    setFieldActionPlayer(null);
    loadMatch();
  };

  const handleReplacePlayer = async (oldUserId, newUserId) => {
    await fetch(`${API_URL}/matches/${id}/replace-player`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchEditForm)
    });
    setEditMatchModal(false);
    loadMatch();
  };

  const handleAddPlayerToTeam = async (userId) => {
    await fetch(`${API_URL}/matches/${id}/add-player`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
    for (const rated_id in ratings) {
      await fetch(`${API_URL}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: id,
          rater_id: user ? user.id : 1,
          rated_id,
          score: ratings[rated_id]
        })
      });
    }
    // Update match status to completed
    await fetch(`${API_URL}/matches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' })
    });
    
    alert('Fim de jogo! Avaliações gravadas com sucesso.');
    setShowRating(false);
    loadMatch();
  };

  const exportWhatsAppCard = async () => {
    if (!cardRef.current) return;
    setIsExporting(true);
    try {
      const node = cardRef.current;
      const width = node.offsetWidth;
      const height = node.offsetHeight;

      const dataUrl = await toPng(node, { 
        cacheBust: true, 
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

  // Process pasted WhatsApp text
  const handleParseWhatsApp = () => {
    const items = parseWhatsAppList(whatsAppText, allPlayers);
    setParsedItems(items);
  };

  // Confirm WhatsApp Convocação selection & auto-create non-existing players
  const handleApplyWhatsAppList = async () => {
    setIsCreatingFromWhatsApp(true);
    try {
      const matchedIds = parsedItems
        .filter(item => item.selected && item.matchedPlayer)
        .map(item => item.matchedPlayer.id);

      const newItems = parsedItems.filter(item => item.selected && !item.matchedPlayer && item.suggestedName && item.suggestedName.trim());

      const newlyCreatedIds = [];

      for (const item of newItems) {
        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      setWhatsAppText('');
      setParsedItems([]);
    } catch (err) {
      console.error('Erro ao processar lista do WhatsApp:', err);
      alert('Ocorreu um erro ao cadastrar novos atletas.');
    } finally {
      setIsCreatingFromWhatsApp(false);
    }
  };

  const teamsReady = match.teams && match.teams.length >= 2;

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

  const sortDefensiveLine = (defList) => {
    const isLateral = (p) => ['LAT', 'LE', 'LD'].includes((p.position || '').toUpperCase());
    const laterais = defList.filter(isLateral);
    const zagueiros = defList.filter(p => !isLateral(p));
    
    if (laterais.length === 0) return zagueiros;
    if (laterais.length === 1) {
      return [laterais[0], ...zagueiros];
    }
    return [laterais[0], ...zagueiros, ...laterais.slice(1)];
  };

  // Group players by formation line for the Tactical Pitch View
  const groupTeamByLines = (teamPlayers, isTopTeam) => {
    const gk = [];
    const def = [];
    const mid = [];
    const fwd = [];

    (teamPlayers || []).forEach(p => {
      const pos = (p.position || 'MEI').toUpperCase();
      if (pos === 'GOL') gk.push(p);
      else if (['ZAG', 'LAT', 'DEF', 'LE', 'LD'].includes(pos)) def.push(p);
      else if (['VOL', 'MEI', 'MC'].includes(pos)) mid.push(p);
      else fwd.push(p);
    });

    const sortedDef = sortDefensiveLine(def);

    if (isTopTeam) {
      // Top team: Goal at top, forwards near halfway line
      return [
        { label: 'Goleiro', players: gk },
        { label: 'Defesa', players: sortedDef },
        { label: 'Meio-Campo', players: mid },
        { label: 'Ataque', players: fwd }
      ];
    } else {
      // Bottom team: Forwards near halfway line, goal at bottom
      return [
        { label: 'Ataque', players: fwd },
        { label: 'Meio-Campo', players: mid },
        { label: 'Defesa', players: sortedDef },
        { label: 'Goleiro', players: gk }
      ];
    }
  };

  const renderTacticalPlayer = (p, themeColor, glowColor) => {
    const gCount = getPlayerEventCount(p.id, 'goals');
    const aCount = getPlayerEventCount(p.id, 'assists');
    const displayName = getPrimaryName(p);
    const pOvr = calcOVR(p);
    const pos = (p.position || 'MEI').toUpperCase();
    const posColor = pos === 'GOL' ? '#fbbf24' : (['ZAG', 'LAT', 'DEF', 'LE', 'LD'].includes(pos) ? '#38bdf8' : (['VOL', 'MEI', 'MC'].includes(pos) ? '#00f59b' : '#f43f5e'));

    return (
      <div 
        key={p.id}
        onClick={() => openPlayerDetails(p)}
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          cursor: 'pointer', 
          transition: 'transform 0.18s',
          width: '100%',
          maxWidth: '84px',
          textAlign: 'center',
          margin: '0 auto'
        }}
        className="hover:scale-110"
        title="Toque para ver estatísticas e histórico"
      >
        {/* Avatar Circular com Borda Brilhante e Badges Flutuantes */}
        <div style={{ position: 'relative' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(7, 10, 16, 0.55)', backdropFilter: 'blur(3px)', border: `2px solid ${themeColor}`, overflow: 'hidden', boxShadow: `0 0 14px ${glowColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {p.photo ? (
              <img src={formatPhotoUrl(p.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, color: themeColor, textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
                {p.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Badge Flutuante de OVR */}
          <div style={{ position: 'absolute', top: -4, right: -6, background: '#07080c', border: `1px solid ${themeColor}`, color: themeColor, fontSize: '0.60rem', fontWeight: 900, padding: '1px 5px', borderRadius: '7px', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
            {pOvr}
          </div>

          {/* Badge Flutuante de Posição */}
          <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', background: posColor, color: '#07080c', fontSize: '0.52rem', fontWeight: 900, padding: '0 4px', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
            {pos}
          </div>
        </div>

        {/* Rótulo com Nome e Contadores de Gol/Assist */}
        <div style={{ background: 'rgba(7, 8, 14, 0.94)', padding: '2px 7px', borderRadius: '7px', fontSize: '0.70rem', fontWeight: 800, color: '#fff', marginTop: '5px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 4px 12px rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span>{displayName}</span>
          {gCount > 0 && <span style={{ color: 'var(--primary)', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '1px' }}><Goal size={10} />{gCount}</span>}
          {aCount > 0 && <span style={{ color: '#fbbf24', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '1px' }}><Footprints size={10} />{aCount}</span>}
        </div>
      </div>
    );
  };

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
              <div className="font-extrabold" style={{ color: '#00f59b', fontSize: 'clamp(1rem, 3.8vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
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
                onChange={e => handleUpdateTeamScore(match.teams[0].id, e.target.value)}
                disabled={match.status === 'completed'}
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
                onChange={e => handleUpdateTeamScore(match.teams[1].id, e.target.value)}
                disabled={match.status === 'completed'}
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
              <div className="font-extrabold" style={{ color: '#ffffff', fontSize: 'clamp(1rem, 3.8vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                <span className="desktop-only">{match.teams[1]?.name || 'COM COLETE'}</span>
                <span className="mobile-only">{formatShortTeamName(match.teams[1]?.name || 'COM COLETE')}</span>
              </div>
              <div className="text-muted text-xs font-bold uppercase tracking-wider mt-1">
                OVR {getTeamOVR(match.teams[1])}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted text-base my-3">Times a definir — faça a convocação e sorteie as equipes abaixo!</div>
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
              Selecione os atletas confirmados para o sorteio ou cole a lista rápida do grupo.
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
              <Shuffle color="var(--primary)" size={20} /> 2. Sorteio Ponderado por OVR (COM COLETE vs SEM COLETE)
            </h4>
            <p className="text-muted text-xs mb-4">
              O algoritmo equilibra automaticamente os dois times usando o OVR e a nota média de cada atleta.
            </p>
            <button className="btn py-4 text-base font-extrabold w-full" onClick={generateTeamsAuto} disabled={selectedPlayers.length === 0} style={{ borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <Shuffle size={20} /> Sortear Equipes Equilibradas ({selectedPlayers.length} Convocados)
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
      {showWhatsAppModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '540px', padding: '20px 16px', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-extrabold text-lg text-main flex items-center gap-2">
                <Clipboard color="#25D366" size={20} /> Reconhecer Lista do WhatsApp
              </h3>
              <button onClick={() => { setShowWhatsAppModal(false); setParsedItems([]); setWhatsAppText(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
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

            <button className="btn mb-3" style={{ padding: '10px', fontSize: '0.88rem' }} onClick={handleParseWhatsApp} disabled={!whatsAppText.trim()}>
              <Sparkles size={16} /> Identificar Jogadores na Lista
            </button>

            {/* Results Preview: Zero rolagem horizontal, 100% alinhado e nomes completos */}
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
                    {/* Linha 1: Checkbox + Texto original do WhatsApp completo sem cortar */}
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

                    {/* Linha 2: Status do Jogador ou Campo de Edição fácil sem puxar pro lado */}
                    <div style={{ paddingLeft: '28px' }}>
                      {item.matchedPlayer ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.12)', border: '1px solid rgba(0, 245, 155, 0.3)', padding: '4px 10px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <Check size={13} /> Atleta: {getPrimaryName(item.matchedPlayer)}
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
                onClick={handleApplyWhatsAppList} 
                disabled={isCreatingFromWhatsApp || parsedItems.filter(i => i.selected).length === 0}
              >
                {isCreatingFromWhatsApp 
                  ? 'Cadastrando & Convocando...' 
                  : `Confirmar Convocação (${parsedItems.filter(i => i.selected).length} Atletas)`}
              </button>
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setShowWhatsAppModal(false)} disabled={isCreatingFromWhatsApp}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
            {viewMode === 'pitch' && (
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
                Escalação Oficial da Partida
              </h4>
              <div style={{ color: '#ffffff', fontSize: '0.88rem', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR')} — {match.time || '15h'} — {match.location || 'Arena Petrópolis'}
                <button 
                  onClick={() => {
                    setMatchEditForm({ date: match.date || '', time: match.time || '', location: match.location || '' });
                    setEditMatchModal(true);
                  }}
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
                {match.teams.map((team, idx) => (
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
                                  onClick={(e) => { e.stopPropagation(); handleSwitchTeam(p.id); }}
                                  disabled={match.status === 'completed'}
                                >
                                  <RefreshCw size={14} />
                                </button>

                                <button 
                                  className="btn btn-secondary" 
                                  style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }} 
                                  title="Substituir por outro atleta do elenco" 
                                  onClick={(e) => { e.stopPropagation(); setSubstituteTarget({ user_id: p.id, name: displayName, team_name: team.name }); }}
                                  disabled={match.status === 'completed'}
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
                                  onChange={e => handleSetPlayerEventCount(p.id, 'goal', e.target.value)}
                                  disabled={match.status === 'completed'}
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
                                  onChange={e => handleSetPlayerEventCount(p.id, 'assist', e.target.value)}
                                  disabled={match.status === 'completed'}
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
              <motion.div 
                key="pitch-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}
              >
                {/* Gramado Tático com Textura Hiper-Realista e Proporções de Transmissão */}
                <div 
                  style={{
                    width: '100%',
                    minHeight: pitchTab === 'both' ? '540px' : '430px',
                    borderRadius: '22px',
                    border: '2px solid rgba(255, 255, 255, 0.35)',
                    position: 'relative',
                    overflow: 'hidden',
                    background: `
                      radial-gradient(ellipse at 50% 10%, rgba(0, 245, 155, 0.22), transparent 60%),
                      radial-gradient(ellipse at 50% 90%, rgba(255, 255, 255, 0.14), transparent 60%),
                      radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%),
                      repeating-linear-gradient(0deg, #0b2e13 0px, #0b2e13 40px, #0e3817 40px, #0e3817 80px)
                    `,
                    boxShadow: 'inset 0 0 80px rgba(0,0,0,0.7), 0 16px 40px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 6px'
                  }}
                >
                  {/* Linhas Demarcatórias Oficiais do Campo */}
                  {/* Borda interna das quatro linhas */}
                  <div style={{ position: 'absolute', inset: '8px', border: '2px solid rgba(255,255,255,0.45)', borderRadius: '14px', pointerEvents: 'none' }} />

                  {/* Linha do Meio de Campo e Círculo Central com Escudo Oficial Preenchendo */}
                  {pitchTab === 'both' && (
                    <>
                      <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '2px', background: 'rgba(255,255,255,0.45)', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      
                      {/* Círculo Central */}
                      <div style={{ position: 'absolute', top: '50%', left: '50%', width: '118px', height: '118px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.45)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

                      {/* Escudo Oficial do Clube em Marca d'Água Preenchendo Completamente o Círculo Central */}
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: '50%', 
                          left: '50%', 
                          transform: 'translate(-50%, -50%)', 
                          width: '114px', 
                          height: '114px', 
                          borderRadius: '50%', 
                          overflow: 'hidden', 
                          opacity: 0.28, 
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 2
                        }}
                      >
                        <img src="/logo.jpeg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    </>
                  )}

                  {/* Grande Área e Gol Superior */}
                  <div style={{ position: 'absolute', top: '8px', left: '50%', width: '190px', height: '68px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                    {/* Pequena Área */}
                    <div style={{ position: 'absolute', top: 0, left: '50%', width: '88px', height: '24px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', transform: 'translateX(-50%)' }} />
                    {/* Marca do Pênalti */}
                    <div style={{ position: 'absolute', bottom: '12px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)' }} />
                    {/* Meia-lua da grande área */}
                    <div style={{ position: 'absolute', bottom: '-20px', left: '50%', width: '56px', height: '20px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', borderRadius: '0 0 50px 50px', transform: 'translateX(-50%)' }} />
                  </div>

                  {/* Grande Área e Gol Inferior */}
                  <div style={{ position: 'absolute', bottom: '8px', left: '50%', width: '190px', height: '68px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                    {/* Pequena Área */}
                    <div style={{ position: 'absolute', bottom: 0, left: '50%', width: '88px', height: '24px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', transform: 'translateX(-50%)' }} />
                    {/* Marca do Pênalti */}
                    <div style={{ position: 'absolute', top: '12px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)' }} />
                    {/* Meia-lua da grande área */}
                    <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '56px', height: '20px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', borderRadius: '50px 50px 0 0', transform: 'translateX(-50%)' }} />
                  </div>

                  {/* Arcos de Escanteio */}
                  <div style={{ position: 'absolute', top: '10px', left: '10px', width: '20px', height: '20px', borderRight: '2px solid rgba(255,255,255,0.45)', borderBottom: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 0 20px 0', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderLeft: '2px solid rgba(255,255,255,0.45)', borderBottom: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 0 0 20px', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '20px', height: '20px', borderRight: '2px solid rgba(255,255,255,0.45)', borderTop: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 20px 0 0', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '20px', height: '20px', borderLeft: '2px solid rgba(255,255,255,0.45)', borderTop: '2px solid rgba(255,255,255,0.45)', borderRadius: '20px 0 0 0', pointerEvents: 'none' }} />

                  {/* Renderização Tática dos Jogadores */}
                  {pitchTab === 'both' ? (
                    <>
                      {/* Metade Superior: Time 0 */}
                      {match.teams[0] && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', zIndex: 5, paddingBottom: '10px' }}>
                          <div style={{ textAlign: 'center' }}>
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                fontSize: '0.80rem', 
                                fontWeight: 900, 
                                padding: '4px 16px', 
                                borderRadius: '14px', 
                                background: 'rgba(7, 8, 12, 0.88)', 
                                color: '#00f59b', 
                                border: '1.5px solid #00f59b',
                                boxShadow: '0 0 14px rgba(0, 245, 155, 0.35)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px'
                              }}
                            >
                              <span>{match.teams[0].name}</span>
                              <span style={{ opacity: 0.6 }}>•</span>
                              <span>OVR {getTeamOVR(match.teams[0])}</span>
                            </span>
                          </div>

                          {groupTeamByLines(match.teams[0].players, true).map((line, lIdx) => {
                            if (line.players.length === 0) return null;
                            return (
                              <div 
                                key={lIdx} 
                                style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: `repeat(${line.players.length}, 1fr)`, 
                                  justifyItems: 'center', 
                                  alignItems: 'center', 
                                  width: '100%', 
                                  maxWidth: '460px', 
                                  margin: '0 auto', 
                                  padding: '0 4px' 
                                }}
                              >
                                {line.players.map(p => renderTacticalPlayer(p, '#00f59b', 'rgba(0, 245, 155, 0.45)'))}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Metade Inferior: Time 1 */}
                      {match.teams[1] && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', zIndex: 5, paddingTop: '10px' }}>
                          {groupTeamByLines(match.teams[1].players, false).map((line, lIdx) => {
                            if (line.players.length === 0) return null;
                            return (
                              <div 
                                key={lIdx} 
                                style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: `repeat(${line.players.length}, 1fr)`, 
                                  justifyItems: 'center', 
                                  alignItems: 'center', 
                                  width: '100%', 
                                  maxWidth: '460px', 
                                  margin: '0 auto', 
                                  padding: '0 4px' 
                                }}
                              >
                                {line.players.map(p => renderTacticalPlayer(p, '#ffffff', 'rgba(255, 255, 255, 0.45)'))}
                              </div>
                            );
                          })}

                          <div style={{ textAlign: 'center' }}>
                            <span 
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                fontSize: '0.80rem', 
                                fontWeight: 900, 
                                padding: '4px 16px', 
                                borderRadius: '14px', 
                                background: 'rgba(7, 8, 12, 0.88)', 
                                color: '#ffffff', 
                                border: '1.5px solid #ffffff',
                                boxShadow: '0 0 14px rgba(255, 255, 255, 0.3)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px'
                              }}
                            >
                              <span>{match.teams[1].name}</span>
                              <span style={{ opacity: 0.6 }}>•</span>
                              <span>OVR {getTeamOVR(match.teams[1])}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : pitchTab === 'team0' ? (
                    match.teams[0] && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', zIndex: 5, padding: '12px 0' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              fontSize: '0.84rem', 
                              fontWeight: 900, 
                              padding: '5px 16px', 
                              borderRadius: '16px', 
                              background: 'rgba(7, 8, 12, 0.88)', 
                              color: '#00f59b', 
                              border: '1.5px solid #00f59b',
                              boxShadow: '0 0 16px rgba(0, 245, 155, 0.35)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px'
                            }}
                          >
                            <span>{match.teams[0].name}</span>
                            <span style={{ opacity: 0.6 }}>•</span>
                            <span>OVR {getTeamOVR(match.teams[0])}</span>
                          </span>
                        </div>

                        {groupTeamByLines(match.teams[0].players, true).map((line, lIdx) => {
                          if (line.players.length === 0) return null;
                          return (
                            <div 
                              key={lIdx} 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: `repeat(${line.players.length}, 1fr)`, 
                                justifyItems: 'center', 
                                alignItems: 'center', 
                                width: '100%', 
                                maxWidth: '460px', 
                                margin: '0 auto', 
                                padding: '0 4px' 
                              }}
                            >
                              {line.players.map(p => renderTacticalPlayer(p, '#00f59b', 'rgba(0, 245, 155, 0.45)'))}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    match.teams[1] && (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', zIndex: 5, padding: '12px 0' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span 
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '8px', 
                              fontSize: '0.84rem', 
                              fontWeight: 900, 
                              padding: '5px 16px', 
                              borderRadius: '16px', 
                              background: 'rgba(7, 8, 12, 0.88)', 
                              color: '#ffffff', 
                              border: '1.5px solid #ffffff',
                              boxShadow: '0 0 16px rgba(255, 255, 255, 0.3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.4px'
                            }}
                          >
                            <span>{match.teams[1].name}</span>
                            <span style={{ opacity: 0.6 }}>•</span>
                            <span>OVR {getTeamOVR(match.teams[1])}</span>
                          </span>
                        </div>

                        {groupTeamByLines(match.teams[1].players, true).map((line, lIdx) => {
                          if (line.players.length === 0) return null;
                          return (
                            <div 
                              key={lIdx} 
                              style={{ 
                                display: 'grid', 
                                gridTemplateColumns: `repeat(${line.players.length}, 1fr)`, 
                                justifyItems: 'center', 
                                alignItems: 'center', 
                                width: '100%', 
                                maxWidth: '460px', 
                                margin: '0 auto', 
                                padding: '0 4px' 
                              }}
                            >
                              {line.players.map(p => renderTacticalPlayer(p, '#ffffff', 'rgba(255, 255, 255, 0.45)'))}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </motion.div>
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
              <span>{match.teams && match.teams[0]?.players && match.teams[1]?.players ? `${match.teams[0].players.length} VS ${match.teams[1].players.length}` : ''}</span>
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
          
          {match.status !== 'completed' && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              transition={{ delay: 0.2 }}
              style={{ display: 'flex', justifyContent: 'center', marginTop: '28px' }}
            >
              <button 
                className="btn py-4 text-lg font-extrabold" 
                style={{ width: '100%', maxWidth: '440px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 auto', boxShadow: '0 4px 20px rgba(0, 245, 155, 0.25)' }}
                onClick={() => setShowRating(true)}
              >
                <Star size={22} fill="#000" /> Encerrar Partida & Avaliar Atletas
              </button>
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
                  onChange={e => handleSetPlayerEventCount(fieldActionPlayer.player.id, 'goal', e.target.value)}
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
                  onChange={e => handleSetPlayerEventCount(fieldActionPlayer.player.id, 'assist', e.target.value)}
                  style={{ width: '48px', height: '34px', textAlign: 'center', fontSize: '0.9rem', fontWeight: '800', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: '8px', color: '#fbbf24', padding: 0, margin: 0 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => handleSwitchTeam(fieldActionPlayer.player.id)}>
                🔄 Trocar de Equipe
              </button>
              <button className="btn btn-secondary" onClick={() => {
                setSubstituteTarget({ user_id: fieldActionPlayer.player.id, name: getPrimaryName(fieldActionPlayer.player) });
                setFieldActionPlayer(null);
              }}>
                👤+ Substituir por Reserva
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
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>Entrar ➔</span>
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

      {/* Vestiário (Avaliação da Partida) - Full Scrollable View for All Players */}
      {showRating && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card mt-4" style={{ borderColor: '#fbbf24', padding: '16px' }}>
          <div style={{ padding: '0 8px' }}>
            <h3 className="font-bold text-xl md:text-2xl mb-1 text-center text-yellow-400">Vestiário (Avaliação da Partida)</h3>
            <p className="text-center text-muted text-xs md:text-sm mb-6">
              Dê a nota para o desempenho de cada jogador na partida de hoje! ({Object.keys(ratings).length}/{allMatchPlayers.length} avaliados)
            </p>
          </div>
          
          {/* Scrollable Player Evaluation Grid */}
          <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px', marginBottom: '24px' }}>
            {match.teams.map((team, tIdx) => (
              <div key={team.id} className="mb-6">
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: tIdx === 0 ? '#00f59b' : '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} /> {team.name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '12px' }}>
                  {team.players.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ flex: '1 1 auto', minWidth: '100px' }}>
                        <span className="font-bold text-main" style={{ fontSize: '0.95rem' }}>{getPrimaryName(p)}</span>
                        {user && user.id === p.id && <span style={{ fontSize: '10px', color: 'var(--primary)', marginLeft: '6px' }}>(Você)</span>}
                      </div>

                      <div className="flex gap-1" style={{ flexShrink: 0 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star} 
                            size={22} 
                            color={ratings[p.id] >= star ? '#fbbf24' : 'rgba(255,255,255,0.1)'} 
                            fill={ratings[p.id] >= star ? '#fbbf24' : 'none'}
                            cursor="pointer"
                            onClick={() => setRatings({ ...ratings, [p.id]: star })}
                            style={{ transition: 'transform 0.15s ease' }}
                            className="hover:scale-125"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn py-3 text-sm md:text-lg font-bold" style={{ flex: '1 1 200px' }} onClick={submitRatings}>
              <CheckCircle2 size={18} /> Confirmar & Finalizar Partida
            </button>
            <button className="btn btn-secondary py-3 text-sm md:text-lg" style={{ flex: '1 1 100px' }} onClick={() => setShowRating(false)}>Voltar</button>
          </div>
        </motion.div>
      )}

      {/* Cinematic Draft Animation Modal */}
      <AnimatePresence>
        {draftAnim && (
          <motion.div
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

                <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.5px' }}>
                  ⚖️ BALANCEANDO EQUIPES...
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0, lineHeight: 1.5 }}>
                  Analisando os <strong style={{ color: '#00f59b' }}>{draftAnim.total} atletas convocados</strong>, combinando OVRs individuais e notas médias para gerar o confronto perfeito!
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
                    {draftAnim.stage === 'done' ? <><Sparkles size={16} /> SORTEIO FINALIZADO COM SUCESSO</> : <><RefreshCw size={16} className="radar-spinner" /> SNAKE DRAFT ({draftAnim.revealedCount} / {draftAnim.total})</>}
                  </div>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    {draftAnim.stage === 'done' ? <><Sparkles size={22} color="var(--primary)" /> Times Prontos para o Jogo!</> : 'Sorteando Jogador a Jogador...'}
                  </h3>
                </div>

                {/* Two Teams Side-by-Side (or stacked on mobile) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  {/* COM COLETE */}
                  <div style={{ background: 'rgba(0, 245, 155, 0.05)', border: '1.5px solid rgba(0, 245, 155, 0.35)', borderRadius: '18px', padding: '16px' }}>
                    <div className="flex justify-between items-center mb-3">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00f59b', fontWeight: 900, fontSize: '1rem' }}>
                        <Shield size={18} /> COM COLETE
                      </div>
                      <span className="badge badge-volt" style={{ fontSize: '0.8rem' }}>
                        OVR Médio: {draftAnim.teamA.length > 0 ? Math.round(draftAnim.teamA.reduce((s, p) => s + calcOVR(p), 0) / draftAnim.teamA.length) : '-'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {draftAnim.teamA.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ scale: 0.6, y: -10, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(0, 245, 155, 0.08)', borderRadius: '10px', border: '1px solid rgba(0, 245, 155, 0.2)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.70rem', fontWeight: 800, padding: '2px 6px', borderRadius: '5px', background: 'rgba(0, 245, 155, 0.2)', color: '#00f59b' }}>
                              {p.position || 'MEI'}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#fff' }}>
                              {getPrimaryName(p)}
                            </span>
                          </div>
                          <span style={{ fontWeight: 900, fontSize: '0.90rem', color: '#fbbf24' }}>
                            {calcOVR(p)}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* SEM COLETE */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1.5px solid rgba(255, 255, 255, 0.25)', borderRadius: '18px', padding: '16px' }}>
                    <div className="flex justify-between items-center mb-3">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff', fontWeight: 900, fontSize: '1rem' }}>
                        <Shield size={18} /> SEM COLETE
                      </div>
                      <span className="badge" style={{ fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                        OVR Médio: {draftAnim.teamB.length > 0 ? Math.round(draftAnim.teamB.reduce((s, p) => s + calcOVR(p), 0) / draftAnim.teamB.length) : '-'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {draftAnim.teamB.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ scale: 0.6, y: -10, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.70rem', fontWeight: 800, padding: '2px 6px', borderRadius: '5px', background: 'rgba(255, 255, 255, 0.15)', color: '#fff' }}>
                              {p.position || 'MEI'}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#fff' }}>
                              {getPrimaryName(p)}
                            </span>
                          </div>
                          <span style={{ fontWeight: 900, fontSize: '0.90rem', color: '#fbbf24' }}>
                            {calcOVR(p)}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                {draftAnim.stage === 'done' && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ textAlign: 'center' }}
                  >
                    <button
                      className="btn"
                      style={{ width: '100%', maxWidth: '380px', padding: '14px 28px', fontSize: '1rem', fontWeight: 900, margin: '0 auto', boxShadow: '0 8px 30px rgba(0, 245, 155, 0.45)' }}
                      onClick={() => {
                        setDraftAnim(null);
                        loadMatch();
                      }}
                    >
                      🚀 Ver Escalação Completa no Campo
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Estatísticas e Histórico do Atleta */}
      <AnimatePresence>
        {selectedPlayerModal && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(0,0,0,0.85)', 
              backdropFilter: 'blur(16px)', 
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 1200, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '16px' 
            }}
            onClick={() => setSelectedPlayerModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass-card"
              style={{ 
                width: '100%', 
                maxWidth: '520px', 
                maxHeight: '90dvh', 
                overflowY: 'auto',
                background: 'rgba(14, 16, 26, 0.98)', 
                borderRadius: '24px', 
                border: '1.5px solid rgba(0, 245, 155, 0.35)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,245,155,0.15)',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}
            >
              {/* Barra Superior do Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Perfil & Histórico do Atleta
                </span>
                <button 
                  onClick={() => setSelectedPlayerModal(null)} 
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cabeçalho do Atleta: Foto, Nome, Posição e OVR */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '18px', border: '1px solid var(--border)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0a0a0f', border: '2.5px solid var(--primary)', boxShadow: '0 0 16px rgba(0, 245, 155, 0.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedPlayerModal.photo ? (
                    <img src={formatPhotoUrl(selectedPlayerModal.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)' }}>
                      {selectedPlayerModal.username?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                    {getPrimaryName(selectedPlayerModal)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-volt" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      {selectedPlayerModal.position || 'MEI'}
                    </span>
                    {selectedPlayerModal.height && <span>• {formatHeight(selectedPlayerModal.height)}m</span>}
                    {selectedPlayerModal.weight && <span>• {selectedPlayerModal.weight}kg</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))', border: '1.5px solid rgba(255, 215, 0, 0.4)', borderRadius: '14px', padding: '8px 12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffd700', lineHeight: 1 }}>
                    {calcOVR(selectedPlayerModal)}
                  </div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffd700', textTransform: 'uppercase', marginTop: '2px' }}>
                    OVR
                  </div>
                </div>
              </div>

              {/* Grid de Estatísticas na Temporada */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Estatísticas na Temporada
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{selectedPlayerModal.matches_count || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>PARTIDAS</div>
                  </div>
                  <div style={{ background: 'rgba(0, 245, 155, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(0, 245, 155, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1 }}>{selectedPlayerModal.goals || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>GOLS</div>
                  </div>
                  <div style={{ background: 'rgba(251, 191, 36, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(251, 191, 36, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1.1 }}>{selectedPlayerModal.assists || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>ASSISTS</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', lineHeight: 1.1 }}>{selectedPlayerModal.win_rate || 0}%</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>VITÓRIAS</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffd700', lineHeight: 1.1 }}>
                      {selectedPlayerModal.avg_rating ? Number(selectedPlayerModal.avg_rating).toFixed(1) : '-'}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>NOTA MÉDIA</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f43f5e', lineHeight: 1.1 }}>{selectedPlayerModal.win_streak || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>SEQUÊNCIA</div>
                  </div>
                </div>
              </div>

              {/* Atributos da Carta FUT */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Atributos da Carta FUT
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'Ritmo (PAC)', val: selectedPlayerModal.pace || 50 },
                    { label: 'Finalização (SHO)', val: selectedPlayerModal.shooting || 50 },
                    { label: 'Passe (PAS)', val: selectedPlayerModal.passing || 50 },
                    { label: 'Drible (DRI)', val: selectedPlayerModal.dribbling || 50 },
                    { label: 'Defesa (DEF)', val: selectedPlayerModal.defending || 50 },
                    { label: 'Físico (PHY)', val: selectedPlayerModal.physical || 50 }
                  ].map(attr => (
                    <div key={attr.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{attr.label}</span>
                        <span style={{ color: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', fontWeight: 900 }}>{attr.val}</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, attr.val))}%`, height: '100%', background: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', borderRadius: '2px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Histórico em Peladas Recentes */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Histórico em Peladas
                </div>
                {playerHistoryLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando histórico...</div>
                ) : playerHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    Nenhuma partida anterior registrada para este atleta.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {playerHistory.map(h => {
                      const hDate = new Date(h.date + 'T12:00:00');
                      const rawHDate = isNaN(hDate.getTime()) ? h.date : hDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                      const formattedHDate = rawHDate ? rawHDate.charAt(0).toUpperCase() + rawHDate.slice(1) : '';

                      return (
                        <div key={h.match_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>{formattedHDate}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.team_name}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', fontWeight: 800 }}>
                            {h.goals > 0 && <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Goal size={13} /> {h.goals}</span>}
                            {h.assists > 0 && <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Footprints size={13} /> {h.assists}</span>}
                            {h.rating && <span style={{ color: '#ffd700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Star size={13} fill="#ffd700" color="#ffd700" /> {h.rating}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botões de Ação do Modal */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                {isMyPlayer(selectedPlayerModal) && (
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '11px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => {
                      setSelectedPlayerModal(null);
                      navigate('/players', { state: { autoEdit: true } });
                    }}
                  >
                    <Edit2 size={16} /> Editar Minha Carta FUT
                  </button>
                )}
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: isMyPlayer(selectedPlayerModal) ? '0 0 100px' : 1, padding: '11px', fontSize: '0.85rem' }}
                  onClick={() => setSelectedPlayerModal(null)}
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
