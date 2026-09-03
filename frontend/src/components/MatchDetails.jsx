import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Users, Shuffle, Star, Shield, ArrowLeft, Share2, Trophy, Goal, Award, Trash2, RefreshCw, UserPlus, UserCheck, X, CheckCircle2, Clipboard, Check, Sparkles, LayoutList, MapPin, Plus, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { calcOVR } from '../utils/ovr';
import { API_URL } from '../config';

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

  // Direct number of goals / assists update for a player
  const handleSetPlayerEventCount = async (playerId, type, val) => {
    const num = parseInt(val, 10);
    const countVal = isNaN(num) ? 0 : Math.max(0, num);

    await fetch(`${API_URL}/matches/${id}/player-events`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: playerId, type, count: countVal })
    });
    loadMatch();
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
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, quality: 0.95 });
      const link = document.createElement('a');
      link.download = `escalacao-partida-${match.date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao exportar imagem:', err);
      alert('Não foi possível gerar a imagem.');
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

  // Group players by formation line for the Tactical Pitch View
  const groupTeamByLines = (teamPlayers, isTopTeam) => {
    const gk = [];
    const def = [];
    const mid = [];
    const fwd = [];

    (teamPlayers || []).forEach(p => {
      const pos = (p.position || 'MEI').toUpperCase();
      if (pos === 'GOL') gk.push(p);
      else if (['ZAG', 'LAT', 'DEF'].includes(pos)) def.push(p);
      else if (['VOL', 'MEI'].includes(pos)) mid.push(p);
      else fwd.push(p);
    });

    if (isTopTeam) {
      // Top team: Goal at top, forwards near halfway line
      return [
        { label: 'Goleiro', players: gk },
        { label: 'Defesa', players: def },
        { label: 'Meio-Campo', players: mid },
        { label: 'Ataque', players: fwd }
      ];
    } else {
      // Bottom team: Forwards near halfway line, goal at bottom
      return [
        { label: 'Ataque', players: fwd },
        { label: 'Meio-Campo', players: mid },
        { label: 'Defesa', players: def },
        { label: 'Goleiro', players: gk }
      ];
    }
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
          PARTIDA DE {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
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
            {/* Left: COM COLETE */}
            <div style={{ flex: '1 1 0', textAlign: 'center', minWidth: 0 }}>
              <div className="font-extrabold" style={{ color: '#00f59b', fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {match.teams[0]?.name || 'COM COLETE'}
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
                title="Alterar placar COM COLETE"
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
                title="Alterar placar SEM COLETE"
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

            {/* Right: SEM COLETE */}
            <div style={{ flex: '1 1 0', textAlign: 'center', minWidth: 0 }}>
              <div className="font-extrabold" style={{ color: '#ffffff', fontSize: 'clamp(0.95rem, 3.2vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {match.teams[1]?.name || 'SEM COLETE'}
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
            {match.status === 'completed' ? '✅ Partida Encerrada' : '🟡 Convocação & Em Andamento'}
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
                          <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)' }}>
                            ✅ Atleta: {getPrimaryName(item.matchedPlayer)}
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
          {/* Header Controls: View Switcher & Export */}
          <div className="flex justify-between items-center flex-wrap gap-3" style={{ marginTop: '24px', marginBottom: '20px' }}>
            <div className="flex p-1" style={{ background: 'rgba(14, 16, 23, 0.8)', borderRadius: '14px', border: '1px solid var(--border)', flex: '1 1 260px' }}>
              <button 
                className={`btn ${viewMode === 'list' ? '' : 'btn-secondary'}`} 
                style={{ padding: '8px 14px', fontSize: '0.8rem', flex: 1, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} 
                onClick={() => setViewMode('list')}
              >
                <LayoutList size={16} /> Lista Detalhada
              </button>
              <button 
                className={`btn ${viewMode === 'pitch' ? '' : 'btn-secondary'}`} 
                style={{ padding: '8px 14px', fontSize: '0.8rem', flex: 1, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} 
                onClick={() => setViewMode('pitch')}
              >
                <MapPin size={16} /> 🏟️ Campo Tático
              </button>
            </div>

            <button className="btn btn-secondary" style={{ width: 'auto', padding: '9px 18px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} onClick={exportWhatsAppCard} disabled={isExporting}>
              <Share2 size={16} /> {isExporting ? 'Gerando...' : '📸 Exportar WhatsApp'}
            </button>
          </div>

          <div ref={cardRef} style={{ padding: '18px 14px', background: '#08090e', borderRadius: '22px', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h4 style={{ color: 'var(--primary)', fontWeight: '900', fontSize: '1.3rem', margin: 0, letterSpacing: '-0.3px' }}>plugshawtycafetoes FC</h4>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>Escalação Oficial da Partida — {new Date(match.date + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
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
                      <span className="badge" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', fontSize: '0.78rem', padding: '4px 10px' }}>
                        OVR Médio: {getTeamOVR(team)}
                      </span>
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
                            style={{ 
                              padding: '12px 12px', 
                              background: 'rgba(255,255,255,0.03)', 
                              borderRadius: '14px', 
                              border: '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px'
                            }}
                          >
                            {/* Linha 1: Avatar + Nome Completo + Posição e Botões de Ação */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--secondary)', overflow: 'hidden', flexShrink: 0, border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {p.photo ? (
                                    <img src={`${API_URL}${p.photo}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }} 
                                  title="Trocar de time (COM COLETE ⇄ SEM COLETE)" 
                                  onClick={() => handleSwitchTeam(p.id)}
                                  disabled={match.status === 'completed'}
                                >
                                  <RefreshCw size={14} />
                                </button>

                                <button 
                                  className="btn btn-secondary" 
                                  style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }} 
                                  title="Substituir por outro atleta do elenco" 
                                  onClick={() => setSubstituteTarget({ user_id: p.id, name: displayName, team_name: team.name })}
                                  disabled={match.status === 'completed'}
                                >
                                  <UserPlus size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Linha 2: Contadores de Gols e Assistências Claros e Espaçosos */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              {/* Goals Counter Pill with ⚽ Emoji */}
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
                                  height: '36px',
                                  flex: 1
                                }} 
                                title="Gols marcados pelo atleta"
                              >
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  ⚽ Gols
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
                                    outline: 'none'
                                  }}
                                />
                              </div>

                              {/* Assists Counter Pill with 👟 Emoji */}
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
                                  height: '36px',
                                  flex: 1
                                }} 
                                title="Assistências do atleta"
                              >
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  👟 Assist.
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
                                    outline: 'none'
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
              /* 2. TACTICAL SOCCER PITCH VIEW */
              <motion.div 
                key="pitch-view"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.28 }}
                style={{ maxWidth: '820px', margin: '0 auto' }}
              >
                <div 
                  style={{
                    width: '100%',
                    minHeight: '680px',
                    borderRadius: '20px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'repeating-linear-gradient(0deg, #134e23, #134e23 45px, #0f3f1c 45px, #0f3f1c 90px)',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '20px 16px'
                  }}
                >
                  {/* Pitch Markings */}
                  <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.4)', transform: 'translateY(-50%)', pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', width: '130px', height: '130px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', top: 0, left: '50%', width: '180px', height: '65px', border: '2px solid rgba(255,255,255,0.4)', borderTop: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}></div>
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', width: '180px', height: '65px', border: '2px solid rgba(255,255,255,0.4)', borderBottom: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}></div>

                  {/* Top Half: COM COLETE */}
                  <div style={{ zIndex: 5, display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    <div style={{ textAlign: 'center' }}>
                      <span className="badge badge-volt" style={{ fontSize: '0.85rem', padding: '6px 16px', background: 'rgba(0,0,0,0.7)' }}>
                        👕 COM COLETE (OVR {getTeamOVR(match.teams[0])})
                      </span>
                    </div>

                    {groupTeamByLines(match.teams[0]?.players, true).map((line, lIdx) => (
                      <div key={lIdx} style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {line.players.map(p => {
                          const gCount = getPlayerEventCount(p.id, 'goals');
                          const aCount = getPlayerEventCount(p.id, 'assists');
                          const displayName = getPrimaryName(p);

                          return (
                            <div 
                              key={p.id}
                              onClick={() => match.status !== 'completed' && setFieldActionPlayer({ player: p, teamName: match.teams[0]?.name })}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: match.status !== 'completed' ? 'pointer' : 'default', transition: 'transform 0.15s' }}
                              className="hover:scale-110"
                            >
                              <div style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '50%', background: '#0a0a0f', border: '2px solid #00f59b', overflow: 'hidden', boxShadow: '0 0 12px rgba(0, 245, 155, 0.4)' }}>
                                {p.photo ? (
                                  <img src={`${API_URL}${p.photo}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold', color: '#00f59b' }}>
                                    {p.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div style={{ background: 'rgba(0,0,0,0.88)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: '800', color: '#fff', marginTop: '3px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {displayName} {gCount > 0 && `⚽${gCount}`} {aCount > 0 && `👟${aCount}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Bottom Half: SEM COLETE */}
                  <div style={{ zIndex: 5, display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '30px' }}>
                    {groupTeamByLines(match.teams[1]?.players, false).map((line, lIdx) => (
                      <div key={lIdx} style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {line.players.map(p => {
                          const gCount = getPlayerEventCount(p.id, 'goals');
                          const aCount = getPlayerEventCount(p.id, 'assists');
                          const displayName = getPrimaryName(p);

                          return (
                            <div 
                              key={p.id}
                              onClick={() => match.status !== 'completed' && setFieldActionPlayer({ player: p, teamName: match.teams[1]?.name })}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: match.status !== 'completed' ? 'pointer' : 'default', transition: 'transform 0.15s' }}
                              className="hover:scale-110"
                            >
                              <div style={{ position: 'relative', width: '42px', height: '42px', borderRadius: '50%', background: '#0a0a0f', border: '2px solid #ffffff', overflow: 'hidden', boxShadow: '0 0 12px rgba(255, 255, 255, 0.4)' }}>
                                {p.photo ? (
                                  <img src={`${API_URL}${p.photo}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                                    {p.username.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div style={{ background: 'rgba(0,0,0,0.88)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: '800', color: '#fff', marginTop: '3px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.1)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {displayName} {gCount > 0 && `⚽${gCount}`} {aCount > 0 && `👟${aCount}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    <div style={{ textAlign: 'center' }}>
                      <span className="badge" style={{ fontSize: '0.85rem', padding: '6px 16px', background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                        ⬛ SEM COLETE (OVR {getTeamOVR(match.teams[1])})
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

            {/* Match Goals Timeline Summary */}
            {match.goals && match.goals.length > 0 && (
              <div className="mt-8 pt-5 border-t border-border">
                <h5 className="font-extrabold mb-3 flex items-center gap-2 text-primary" style={{ fontSize: '0.95rem' }}><Goal size={18} /> Gols Registrados na Partida ({match.goals.length})</h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {match.goals.map((g) => (
                    <span key={g.id} style={{ background: 'rgba(0,245,155,0.1)', padding: '5px 12px', borderRadius: '12px', fontSize: '0.82rem', border: '1px solid rgba(0,245,155,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      ⚽ <strong>{getPrimaryName(g)}</strong>
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
                      👟 <strong>{getPrimaryName(a)}</strong>
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
          </div>
          
          {match.status !== 'completed' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <button className="btn mt-8 py-4 text-lg font-extrabold" onClick={() => setShowRating(true)}>
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
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--primary)' }}>⚽ Gols:</span>
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
                <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#fbbf24' }}>👟 Assist:</span>
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
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card mt-4" style={{ borderColor: '#fbbf24', padding: '28px' }}>
          <h3 className="font-bold text-2xl mb-1 text-center text-yellow-400">Vestiário (Avaliação da Partida)</h3>
          <p className="text-center text-muted text-sm mb-6">
            Dê a nota para o desempenho de cada jogador na partida de hoje! ({Object.keys(ratings).length}/{allMatchPlayers.length} avaliados)
          </p>
          
          {/* Scrollable Player Evaluation Grid */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '6px', marginBottom: '24px' }}>
            {match.teams.map((team, tIdx) => (
              <div key={team.id} className="mb-6">
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: tIdx === 0 ? '#00f59b' : '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} /> {team.name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                  {team.players.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3.5" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div>
                        <span className="font-bold text-base text-main">{getPrimaryName(p)}</span>
                        {user && user.id === p.id && <span style={{ fontSize: '10px', color: 'var(--primary)', marginLeft: '6px' }}>(Você)</span>}
                      </div>

                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star} 
                            size={24} 
                            color={ratings[p.id] >= star ? '#fbbf24' : 'var(--border)'} 
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
          
          <div className="flex gap-4">
            <button className="btn py-4 text-lg font-bold" onClick={submitRatings}>
              <CheckCircle2 size={20} /> Confirmar Notas & Finalizar Partida
            </button>
            <button className="btn btn-secondary py-4 text-lg" onClick={() => setShowRating(false)}>Voltar</button>
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
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                    {draftAnim.stage === 'done' ? '🔥 Times Prontos para o Jogo!' : 'Sorteando Jogador a Jogador...'}
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '140px', maxHeight: '240px', overflowY: 'auto' }}>
                      {draftAnim.teamA.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ scale: 0.6, y: -10, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0, 245, 155, 0.08)', borderRadius: '12px', border: '1px solid rgba(0, 245, 155, 0.2)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: 'rgba(0, 245, 155, 0.2)', color: '#00f59b' }}>
                              {p.position || 'MEI'}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#fff' }}>
                              {getPrimaryName(p)}
                            </span>
                          </div>
                          <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#fbbf24' }}>
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

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '140px', maxHeight: '240px', overflowY: 'auto' }}>
                      {draftAnim.teamB.map((p) => (
                        <motion.div
                          key={p.id}
                          initial={{ scale: 0.6, y: -10, opacity: 0 }}
                          animate={{ scale: 1, y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.15)', color: '#fff' }}>
                              {p.position || 'MEI'}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>
                              {getPrimaryName(p)}
                            </span>
                          </div>
                          <span style={{ fontWeight: 900, fontSize: '0.95rem', color: '#fbbf24' }}>
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
    </motion.div>
  );
}
