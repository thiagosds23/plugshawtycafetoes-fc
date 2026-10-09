import React, { useEffect, useState, useContext, useRef, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import {
  Users, Shuffle, Star, ArrowLeft, Share2, Goal,
  Award, Trash2, RefreshCw, UserPlus, CheckCircle2,
  Clipboard, LayoutList, MapPin, Plus,
  Footprints, Lightbulb, Clock, Edit2, Swords
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import confetti from 'canvas-confetti';
import { calcOVR, calcTeamOVR } from '../utils/ovr';
import { API_URL, authHeaders, isAdminUser } from '../config';
import { api, fetchAcompanhado } from '../utils/api';
import { waitForImages } from '../utils/exportImage';
import { getPrimaryName, formatShortTeamName } from '../utils/formatters';
import { prepararAudio } from '../utils/soundEffects';
import { sortearTimes, ordemDeRevelacao } from '../utils/sorteio';
import DraftAnimation from './match/DraftAnimation';
import WhatsAppImportModal from './match/WhatsAppImportModal';
import RatingModal, { ContadorPrazo } from './match/RatingModal';
import RatingWindowAdmin from './match/RatingWindowAdmin';
import ManualTeamsModal from './match/ManualTeamsModal';
import TacticalPitch from './match/TacticalPitch';
import CartaoDoTime from './match/CartaoDoTime';
import NovoAtletaModal from './match/NovoAtletaModal';
import EditarPartidaModal from './match/EditarPartidaModal';
import AdicionarJogadorModal from './match/AdicionarJogadorModal';
import SubstituirJogadorModal from './match/SubstituirJogadorModal';
import PlayerDetailsModal from './player/PlayerDetailsModal';

const DICA_PLACAR = 'Apague para voltar ao placar automático (soma dos gols)';

// Espera depois da última tecla antes de gravar placar, gols e assistências
const ESPERA_DO_DEBOUNCE = 600;

/** Mostra ao usuário o motivo que o servidor deu (ou a falta de conexão). */
function avisarErro(contexto, err) {
  console.error(`${contexto}:`, err);
  alert(err.message);
}

/** Gols lançados para os atletas de um time: o placar automático dele. */
function golsDoTime(gols, jogadores) {
  const ids = new Set((jogadores || []).map(p => p.id));
  return (gols || []).filter(g => ids.has(g.user_id)).length;
}

export default function MatchDetails() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const token = user?.token;

  const [match, setMatch] = useState(null);
  // Falha ao carregar a partida: { naoEncontrada: true } (404) ou { mensagem }
  const [erroCarga, setErroCarga] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [erroElenco, setErroElenco] = useState(null);
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  const [showRating, setShowRating] = useState(false);
  const [ratings, setRatings] = useState({});
  const [enviandoNotas, setEnviandoNotas] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // View Mode: 'list' (Escalação Detalhada) or 'pitch' (Campo Tático)
  const [viewMode, setViewMode] = useState('list');

  // WhatsApp List Convocação Modal State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [isCreatingFromWhatsApp, setIsCreatingFromWhatsApp] = useState(false);

  // Cadastro rápido de atleta
  const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);

  // Substitute Player Modal state
  const [substituteTarget, setSubstituteTarget] = useState(null); // { user_id, name, team_name }

  // Cinematic Team Draft Animation state
  const [draftAnim, setDraftAnim] = useState(null);

  // Times montados à mão, sem sorteio
  const [showManualTeams, setShowManualTeams] = useState(false);
  const [savingManualTeams, setSavingManualTeams] = useState(false);
  // Escalação contra rival sendo gravada (trava o botão contra o toque duplo)
  const [salvandoEscalacao, setSalvandoEscalacao] = useState(false);
  // Trocar de time / tirar da partida em andamento: dois toques em "trocar de time"
  // trocavam e destrocavam o atleta
  const [mexendoNaEscalacao, setMexendoNaEscalacao] = useState(false);

  // Match Edit & Add Player
  const [editMatchModal, setEditMatchModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(null); // holds teamId

  // Tactical Pitch Tab: 'both' | 'team0' | 'team1'
  const [pitchTab, setPitchTab] = useState('both');

  // Player Stats & History Modal State
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  // Texto do placar enquanto o administrador digita (id do time -> texto). Sem isto,
  // apagar o número para digitar outro já trocava o campo pelo placar automático e o
  // próximo dígito grudava nele ("2" virava "25").
  const [placarDigitado, setPlacarDigitado] = useState({});

  // IMPORTANTE: todos os hooks (useState/useEffect/useRef/useMemo/useCallback) ficam
  // aqui em cima. Um hook declarado depois do "if (!match) return ..." faz o React
  // rodar uma quantidade diferente de hooks entre o carregamento e a tela pronta
  // (erro #310).
  const cardRef = useRef(null);
  const montadoRef = useRef(false);
  // Número do último pedido de carga da partida: só a resposta dele vale
  const cargaAtualRef = useRef(0);
  // Placar, gols e assistências: envios no debounce (pendentes), requisições em voo e
  // a fila de cada campo. O objeto nunca é trocado, só mutado.
  const enviosRef = useRef({ pendentes: {}, emVoo: 0, filas: {} });
  // setTimeout/setInterval do sorteio, para não continuarem depois de sair da tela
  const timersDoSorteioRef = useRef([]);
  // Ids negativos dos gols/assistências otimistas (ainda não gravados)
  const proximoIdOtimistaRef = useRef(-1);

  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const loadMatch = useCallback(async () => {
    // Recargas que se cruzam (ou a troca de partida) não podem trazer dados velhos
    // de volta: só a resposta do pedido mais recente é usada
    const pedido = ++cargaAtualRef.current;
    const valeAinda = () => montadoRef.current && pedido === cargaAtualRef.current;
    try {
      let res;
      try {
        // O token vai junto para o backend devolver as notas que EU já dei. É fetch
        // direto, e não api(), porque aqui o 404 tem tela própria
        res = await fetchAcompanhado(`${API_URL}/matches/${id}`, { headers: authHeaders({ token }) });
      } catch {
        throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
      }
      if (!valeAinda()) return;
      if (res.status === 404) {
        setMatch(null);
        setErroCarga({ naoEncontrada: true });
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error((data && data.error) || `Erro ${res.status} ao carregar a partida.`);
      if (!valeAinda()) return;
      setMatch(data);
      setErroCarga(null);
    } catch (err) {
      if (!valeAinda()) return;
      console.error('Erro ao carregar a partida:', err);
      setErroCarga({ mensagem: err.message });
    }
  }, [id, token]);

  const loadPlayers = useCallback(async () => {
    try {
      const data = await api('/stats');
      if (!montadoRef.current) return;
      // Continua sendo uma lista mesmo se o servidor devolver outra coisa
      setAllPlayers(Array.isArray(data) ? data : []);
      setErroElenco(null);
    } catch (err) {
      if (!montadoRef.current) return;
      console.error('Erro ao carregar o elenco:', err);
      setErroElenco(err.message);
    }
  }, []);

  useEffect(() => {
    loadMatch();
  }, [loadMatch]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Histórico do atleta aberto no modal. Trocar de atleta rápido cancela o pedido
  // anterior: sem isso a resposta atrasada do primeiro aparecia no perfil do segundo.
  const atletaAbertoId = selectedPlayerModal?.id;
  useEffect(() => {
    if (!atletaAbertoId) {
      setPlayerHistory([]);
      return undefined;
    }
    const controle = new AbortController();
    setPlayerHistory([]);
    setPlayerHistoryLoading(true);
    api(`/users/${atletaAbertoId}/history`, { signal: controle.signal })
      .then(data => {
        if (!controle.signal.aborted) setPlayerHistory(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (err.name === 'AbortError' || controle.signal.aborted) return;
        console.error('Erro ao carregar histórico do jogador:', err);
        setPlayerHistory([]);
      })
      .finally(() => {
        if (!controle.signal.aborted) setPlayerHistoryLoading(false);
      });
    return () => controle.abort();
  }, [atletaAbertoId]);

  // Recarrega as notas que este usuário já enviou, para ele conseguir corrigir
  // dentro do prazo em vez de começar do zero.
  const minhasNotasSalvas = match && match.my_ratings ? JSON.stringify(match.my_ratings) : '';
  useEffect(() => {
    setRatings(minhasNotasSalvas ? JSON.parse(minhasNotasSalvas) : {});
  }, [minhasNotasSalvas]);

  // Ao sair da tela com um número ainda no debounce, grava na hora em vez de
  // descartar: senão o último gol digitado antes de tocar em "Voltar" se perdia
  useEffect(() => {
    const envios = enviosRef.current;
    return () => {
      Object.values(envios.pendentes).forEach(({ timer, enviar }) => {
        clearTimeout(timer);
        enviar().catch(err => console.error('Falha ao salvar ao sair da partida:', err));
      });
      envios.pendentes = {};
    };
  }, []);

  // Para a animação do sorteio ao sair da tela
  useEffect(() => {
    const timers = timersDoSorteioRef.current;
    return () => {
      timers.forEach(t => { clearTimeout(t); clearInterval(t); });
      timers.length = 0;
    };
  }, []);

  // Contagem de gols e assistências por atleta, calculada uma vez por mudança na
  // partida. Antes cada linha da tela varria a lista inteira de eventos.
  const golsDaPartida = match?.goals;
  const assistsDaPartida = match?.assists;
  const contagemEventos = useMemo(() => {
    const contar = (eventos) => {
      const mapa = new Map();
      (eventos || []).forEach(e => mapa.set(e.user_id, (mapa.get(e.user_id) || 0) + 1));
      return mapa;
    };
    return { goals: contar(golsDaPartida), assists: contar(assistsDaPartida) };
  }, [golsDaPartida, assistsDaPartida]);

  const getPlayerEventCount = useCallback(
    (playerId, tipo) => (contagemEventos[tipo] ? contagemEventos[tipo].get(playerId) || 0 : 0),
    [contagemEventos]
  );

  const timesDaPartida = match?.teams;
  const ovrPorTime = useMemo(
    () => new Map((timesDaPartida || []).map(t => [t.id, calcTeamOVR(t.players)])),
    [timesDaPartida]
  );
  const getTeamOVR = useCallback(
    (team) => (team ? (ovrPorTime.get(team.id) ?? calcTeamOVR(team.players)) : 0),
    [ovrPorTime]
  );

  // Atletas em campo nesta partida e os do elenco que estão de fora (reservas)
  const jogadoresDaPartida = useMemo(
    () => (timesDaPartida || []).flatMap(t => t.players || []),
    [timesDaPartida]
  );
  const foraDaPartida = useMemo(() => {
    const emCampo = new Set(jogadoresDaPartida.map(p => p.id));
    return allPlayers.filter(p => !emCampo.has(p.id));
  }, [allPlayers, jogadoresDaPartida]);

  // Só o id identifica o atleta: comparar por nome ou apelido marcava como "meu" o
  // atleta errado quando dois tinham nomes parecidos
  const isMyPlayer = (p) => !!(user && p && user.id != null && String(p.id) === String(user.id));

  const openPlayerDetails = (p) => {
    const fullP = allPlayers.find(ap => ap.id === p.id) || p;
    setSelectedPlayerModal(fullP);
  };

  const tentarDeNovo = () => {
    setErroCarga(null);
    loadMatch();
    loadPlayers();
  };

  if (!match) {
    if (erroCarga && erroCarga.naoEncontrada) {
      return (
        <div className="glass-card text-center" style={{ maxWidth: '440px', margin: '44px auto 0', padding: '28px 20px' }}>
          <h3 className="font-extrabold text-main" style={{ margin: '0 0 8px' }}>Partida não encontrada</h3>
          <p className="text-muted" style={{ margin: '0 0 18px', fontSize: '0.88rem' }}>
            Ela pode ter sido excluída ou o link está errado.
          </p>
          <Link to="/matches" className="btn" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Voltar para o Histórico
          </Link>
        </div>
      );
    }
    if (erroCarga) {
      return (
        <div className="glass-card text-center" style={{ maxWidth: '440px', margin: '44px auto 0', padding: '28px 20px' }}>
          <h3 className="font-extrabold text-main" style={{ margin: '0 0 8px' }}>Não foi possível carregar a partida</h3>
          <p className="text-muted" style={{ margin: '0 0 18px', fontSize: '0.88rem' }}>{erroCarga.mensagem}</p>
          <div className="flex justify-center gap-3">
            <button className="btn" style={{ width: 'auto' }} onClick={tentarDeNovo}>
              <RefreshCw size={16} /> Tentar de novo
            </button>
            <Link to="/matches" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Voltar
            </Link>
          </div>
        </div>
      );
    }
    return <div className="text-center mt-10 text-muted">Carregando dados da partida...</div>;
  }

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

  const dataDaPartida = new Date(match.date + 'T12:00:00');
  // A temporada do rodapé da arte é a do ano do jogo, não um ano fixo
  const anoDaPartida = isNaN(dataDaPartida.getTime()) ? new Date().getFullYear() : dataDaPartida.getFullYear();

  // ---------------------------------------------------------------------------
  // Permissões e prazo de avaliação
  // ---------------------------------------------------------------------------
  const isAdmin = isAdminUser(user);
  const partidaEncerrada = match.status === 'completed';

  // Placar, gols, assistências e a agenda são só do administrador.
  const podeEditarPlacar = isAdmin;
  // A escalação fica livre para o grupo montar até o apito final.
  const podeMexerNaEscalacao = isAdmin || !partidaEncerrada;
  // Sortear de novo: só no racha ainda aberto e antes de lançar gols ou placar, porque
  // refazer os times depois disso embaralharia o que já foi lançado
  const temLancesNaPartida = (match.goals || []).length > 0
    || (match.assists || []).length > 0
    || (match.teams || []).some(t => t.manual_score !== null && t.manual_score !== undefined);
  const podeSortearDeNovo = teamsReady && !isRival && !partidaEncerrada && podeMexerNaEscalacao && !temLancesNaPartida;

  const handleSortearDeNovo = () => {
    const escalados = (match.teams || []).flatMap(t => t.players);
    const confirmado = window.confirm(
      `Sortear os times de novo com os ${escalados.length} atletas escalados? O novo sorteio evita repetir a divisão atual.`
    );
    if (!confirmado) return;
    generateTeamsAuto(escalados, match.teams.map(t => t.players.map(p => p.id)));
  };

  const euJoguei = !!(user && jogadoresDaPartida.some(p => p.id === user.id));
  const janelaAberta = !!match.rating_open;
  const podeAvaliar = partidaEncerrada && janelaAberta && euJoguei;
  const jaAvaliei = !!(match.my_ratings && Object.keys(match.my_ratings).length > 0);
  const quantosAvaliaram = (match.raters || []).length;
  // O painel de notas ocupa o lugar da escalação. Se o prazo vencer com ele aberto, a
  // escalação volta (antes a tela ficava vazia)
  const mostrandoAvaliacao = showRating && podeAvaliar;

  // ---------------------------------------------------------------------------
  // Gravação com debounce (placar, gols e assistências)
  // ---------------------------------------------------------------------------

  // Recarrega a partida só quando nada mais está para ser gravado: com um número
  // ainda no debounce ou a caminho do servidor, o refetch apagaria o que o
  // administrador acabou de digitar. O último envio a terminar é que recarrega.
  const recarregarSeOcioso = () => {
    const envios = enviosRef.current;
    if (!montadoRef.current) return;
    if (Object.keys(envios.pendentes).length === 0 && envios.emVoo === 0) loadMatch();
  };

  const agendarEnvio = (chave, enviar) => {
    const envios = enviosRef.current;
    if (envios.pendentes[chave]) clearTimeout(envios.pendentes[chave].timer);

    const timer = setTimeout(async () => {
      // Saiu do debounce e virou requisição em voo. Só apaga a chave se ela ainda for
      // deste timer: apagar sem conferir (como era feito no finally, depois do envio)
      // sumia com o timer novo de quem digitou de novo durante o envio
      if (envios.pendentes[chave] && envios.pendentes[chave].timer === timer) {
        delete envios.pendentes[chave];
      }
      envios.emVoo += 1;

      // Envios do mesmo campo saem em fila, para o último número digitado chegar por último
      const envio = (envios.filas[chave] || Promise.resolve()).then(enviar);
      const fila = envio.catch(() => {});
      envios.filas[chave] = fila;
      try {
        await envio;
      } catch (err) {
        if (montadoRef.current) avisarErro('Erro ao salvar na partida', err);
      } finally {
        envios.emVoo -= 1;
        if (envios.filas[chave] === fila) delete envios.filas[chave];
        recarregarSeOcioso();
      }
    }, ESPERA_DO_DEBOUNCE);

    envios.pendentes[chave] = { timer, enviar };
  };

  const handleTogglePlayer = (playerId) => {
    if (selectedPlayers.includes(playerId)) {
      setSelectedPlayers(selectedPlayers.filter(p => p !== playerId));
    } else {
      setSelectedPlayers([...selectedPlayers, playerId]);
    }
  };

  // Contra rival não há sorteio: os convocados formam direto o nosso time
  const saveRivalLineup = async () => {
    if (selectedPlayers.length === 0 || salvandoEscalacao) return;
    setSalvandoEscalacao(true);
    try {
      await api(`/matches/${id}/teams`, {
        method: 'POST',
        user,
        body: { teams: [{ name: 'plugshawty FC', playerIds: selectedPlayers }] }
      });
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Erro ao salvar a escalação', err);
    } finally {
      setSalvandoEscalacao(false);
    }
  };

  // Escalações dos últimos rachas, para o sorteio variar as duplas. Não espera mais de
  // 2,5s (servidor acordando): sem histórico o sorteio segue pelo equilíbrio e posições.
  const historicoParaOSorteio = async (escalacaoAtual) => {
    const limite = new Promise(resolve => setTimeout(() => resolve([]), 2500));
    const recentes = api('/lineups/recent?limit=4').catch(err => {
      console.error('Sem histórico para o sorteio:', err);
      return [];
    });
    const historico = await Promise.race([recentes, limite]);
    const lista = Array.isArray(historico) ? historico.filter(h => h.match_id !== Number(id)) : [];
    // No "sortear de novo" a divisão atual vira a mais recente: o sorteio foge dela
    return escalacaoAtual ? [{ teams: escalacaoAtual }, ...lista] : lista;
  };

  // Sorteio equilibrado (utils/sorteio.js): força parecida, posições divididas e duplas
  // diferentes dos últimos rachas, escolhido ao acaso entre as melhores divisões. Sem
  // argumentos usa os convocados; o "sortear de novo" passa quem já está escalado.
  const generateTeamsAuto = async (jogadores = allPlayers.filter(p => selectedPlayers.includes(p.id)), escalacaoAtual = null) => {
    if (jogadores.length < 2) return;

    // O iPhone só libera o áudio dentro de um toque: o contexto de áudio nasce aqui,
    // no clique, para os bipes do sorteio conseguirem tocar depois
    prepararAudio();

    const timers = timersDoSorteioRef.current;
    const pararSorteio = () => {
      timers.forEach(t => { clearTimeout(t); clearInterval(t); });
      timers.length = 0;
    };
    pararSorteio();

    // A animação começa na hora; o histórico carrega enquanto as cartas embaralham
    setDraftAnim({
      stage: 'shuffling',
      sequence: [],
      teamA: [],
      teamB: [],
      revealedCount: 0,
      total: jogadores.length,
      resumo: null
    });

    const historico = await historicoParaOSorteio(escalacaoAtual);
    if (!montadoRef.current) return;

    const { timeA, timeB, resumo } = sortearTimes(jogadores, { historico });
    const sequence = ordemDeRevelacao(timeA, timeB);
    setDraftAnim(prev => (prev ? { ...prev, sequence, resumo } : null));

    // Grava enquanto a animação roda. A promessa nunca rejeita: devolve o erro (ou
    // null), e o fim da animação decide entre comemorar e não fazer nada
    const gravacao = api(`/matches/${id}/teams`, {
      method: 'POST',
      user,
      body: {
        teams: [
          { name: 'COM COLETE', playerIds: timeA.map(p => p.id) },
          { name: 'SEM COLETE', playerIds: timeB.map(p => p.id) }
        ]
      }
    }).then(() => null, err => err);

    // Se a gravação falhar não adianta terminar a animação (nem soltar confete): fecha
    // o sorteio e mostra o motivo. Antes o overlay ficava preso em erro de rede.
    gravacao.then(erro => {
      if (!erro || !montadoRef.current) return;
      pararSorteio();
      setDraftAnim(null);
      avisarErro('Erro ao salvar o sorteio', erro);
    });

    // Phase 1 -> Phase 2: Sequential Draft Reveal (after 1000ms).
    // Os sons ficam com o DraftAnimation, que toca conforme o estágio.
    timers.push(setTimeout(() => {
      setDraftAnim(prev => prev ? { ...prev, stage: 'revealing' } : null);

      let current = 0;
      const interval = setInterval(() => {
        current += 1;
        if (current <= sequence.length) {
          const item = sequence[current - 1];
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
          // Phase 3: Celebration — só depois de confirmar que os times foram gravados
          timers.push(setTimeout(async () => {
            const erro = await gravacao;
            if (erro || !montadoRef.current) return;
            confetti({
              particleCount: 110,
              spread: 85,
              origin: { y: 0.55 },
              colors: ['#00f59b', '#fbbf24', '#00e5ff', '#ffffff']
            });
            setDraftAnim(prev => prev ? { ...prev, stage: 'done' } : null);
          }, 350));
        }
      }, 190);
      timers.push(interval);
    }, 1000));
  };

  // Times montados à mão: grava no mesmo formato do sorteio
  const saveManualTeams = async (teamAIds, teamBIds) => {
    setSavingManualTeams(true);
    try {
      await api(`/matches/${id}/teams`, {
        method: 'POST',
        user,
        body: {
          teams: [
            { name: 'COM COLETE', playerIds: teamAIds },
            { name: 'SEM COLETE', playerIds: teamBIds }
          ]
        }
      });
      setShowManualTeams(false);
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Falha ao salvar os times', err);
    } finally {
      setSavingManualTeams(false);
    }
  };

  // Tira o atleta da partida, junto com os gols, assistências e notas dele nela
  const handleRemovePlayer = async (player) => {
    const confirmado = window.confirm(
      `Tirar ${getPrimaryName(player)} desta partida? Os gols, assistências e notas dele nesta partida também serão apagados.`
    );
    if (!confirmado) return;

    setMexendoNaEscalacao(true);
    try {
      await api(`/matches/${id}/players/${player.id}`, { method: 'DELETE', user });
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Falha ao tirar atleta da partida', err);
    } finally {
      setMexendoNaEscalacao(false);
    }
  };

  // Placar digitado pelo administrador (DEBOUNCED, um por time). Campo vazio volta ao
  // placar automático, a soma dos gols lançados para o time, em vez de virar 0 para sempre.
  const handleUpdateTeamScore = (teamId, val, inputEl) => {
    const texto = String(val ?? '').trim();
    const num = parseInt(texto, 10);
    const placarManual = texto === '' || isNaN(num) ? null : Math.min(99, Math.max(0, num));

    // O campo mostra o que está sendo digitado (inclusive vazio) até perder o foco
    setPlacarDigitado(prev => ({ ...prev, [teamId]: placarManual === null ? '' : String(placarManual) }));
    // Mesma correção dos campos de gol: evita o campo ficar mostrando "01"
    if (inputEl && placarManual !== null && inputEl.value !== String(placarManual)) {
      inputEl.value = String(placarManual);
    }

    // Optimistic local update
    setMatch(prev => {
      if (!prev) return prev;
      const updatedTeams = (prev.teams || []).map(t =>
        t.id === teamId
          ? { ...t, manual_score: placarManual, score: placarManual ?? golsDoTime(prev.goals, t.players) }
          : t
      );
      return { ...prev, teams: updatedTeams };
    });

    agendarEnvio(`placar-${teamId}`, () =>
      api(`/matches/${id}/team-score`, { method: 'PUT', user, body: { team_id: teamId, score: placarManual } })
    );
  };

  const esquecerPlacarDigitado = (teamId) => {
    setPlacarDigitado(prev => {
      const resto = { ...prev };
      delete resto[teamId];
      return resto;
    });
  };

  // Direct number of goals / assists update for a player (DEBOUNCED)
  const handleSetPlayerEventCount = (playerId, type, val, inputEl) => {
    const num = parseInt(val, 10);
    const countVal = isNaN(num) ? 0 : Math.min(30, Math.max(0, num));

    // Digitar 1 em cima de um campo que ja mostrava 0 deixaria "01" na tela: o React
    // compara o valor do input com o novo de forma fraca e "01" == 1, entao ele nao
    // reescreve o campo sozinho. Aqui corrigimos o texto na hora.
    if (inputEl && inputEl.value !== String(countVal)) {
      inputEl.value = String(countVal);
    }

    // Ids negativos marcam os eventos otimistas. Contador próprio em vez de Date.now():
    // dois atletas lançados no mesmo milissegundo repetiam o id (e a key do React)
    const idsOtimistas = Array.from({ length: countVal }, () => proximoIdOtimistaRef.current--);

    // Optimistic local update — update match state immediately without API call
    setMatch(prev => {
      if (!prev) return prev;
      const eventKey = type === 'goal' ? 'goals' : 'assists';
      // O chip do gol mostra o nome do atleta: o evento otimista já leva o nome dele
      const timeDoAtleta = (prev.teams || []).find(t => (t.players || []).some(p => p.id === playerId));
      const atleta = timeDoAtleta ? timeDoAtleta.players.find(p => p.id === playerId) : null;
      // Remove old events for this player
      const filtered = (prev[eventKey] || []).filter(e => e.user_id !== playerId);
      // Add new events
      idsOtimistas.forEach(idOtimista => {
        filtered.push({
          id: idOtimista,
          match_id: prev.id,
          user_id: playerId,
          username: atleta?.username,
          nickname: atleta?.nickname,
          team_id: timeDoAtleta?.id
        });
      });
      const updatedMatch = { ...prev, [eventKey]: filtered };
      if (type === 'goal' && Array.isArray(prev.teams)) {
        updatedMatch.teams = prev.teams.map(t => {
          if (t.manual_score !== null && t.manual_score !== undefined) return t;
          return { ...t, score: golsDoTime(filtered, t.players) };
        });
      }
      return updatedMatch;
    });

    agendarEnvio(`${playerId}-${type}`, () =>
      api(`/matches/${id}/player-events`, { method: 'PUT', user, body: { user_id: playerId, type, count: countVal } })
    );
  };

  const removeEvent = async (type, eventId) => {
    try {
      await api(`/${type}/${eventId}`, { method: 'DELETE', user });
    } catch (err) {
      avisarErro('Erro ao excluir o lançamento', err);
    }
    recarregarSeOcioso();
  };

  const handleDeleteMatch = async () => {
    if (!window.confirm('Tem certeza que deseja excluir esta partida? Todos os gols, assistências e notas dela serão apagados permanentemente.')) return;
    try {
      await api(`/matches/${id}`, { method: 'DELETE', user });
      // Só sai da tela se a partida foi mesmo excluída
      navigate('/matches');
    } catch (err) {
      avisarErro('Erro ao excluir a partida', err);
    }
  };

  const handleSwitchTeam = async (userId) => {
    setMexendoNaEscalacao(true);
    try {
      await api(`/matches/${id}/switch-team`, { method: 'PUT', user, body: { user_id: userId } });
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Erro ao trocar o atleta de time', err);
    } finally {
      setMexendoNaEscalacao(false);
    }
  };

  const handleReplacePlayer = async (oldUserId, newUserId) => {
    try {
      await api(`/matches/${id}/replace-player`, {
        method: 'PUT',
        user,
        body: { old_user_id: oldUserId, new_user_id: newUserId }
      });
    } catch (err) {
      avisarErro('Erro ao substituir o atleta', err);
      return;
    }
    setSubstituteTarget(null);
    recarregarSeOcioso();
  };

  const handleUpdateMatchInfo = async (form) => {
    try {
      await api(`/matches/${id}`, { method: 'PUT', user, body: form });
    } catch (err) {
      avisarErro('Erro ao editar a partida', err);
      return;
    }
    setEditMatchModal(false);
    recarregarSeOcioso();
  };

  const handleAddPlayerToTeam = async (userId) => {
    try {
      await api(`/matches/${id}/add-player`, {
        method: 'PUT',
        user,
        body: { user_id: userId, team_id: showAddPlayerModal }
      });
    } catch (err) {
      avisarErro('Erro ao adicionar o atleta', err);
      return;
    }
    setShowAddPlayerModal(null);
    recarregarSeOcioso();
  };

  // Create player manually on this screen
  const handleCreateManualPlayer = async ({ username, nickname, position }) => {
    try {
      const created = await api('/users', { method: 'POST', user, body: { username, nickname, position } });
      await loadPlayers();

      // If teams not created yet, add directly to convocação
      if (!teamsReady && created && created.id) {
        setSelectedPlayers(prev => Array.from(new Set([...prev, created.id])));
      }
      setShowNewPlayerModal(false);
    } catch (err) {
      avisarErro('Erro ao cadastrar atleta', err);
    }
  };

  const submitRatings = async () => {
    if (enviandoNotas) return;
    // Só vão as notas dos atletas desta partida (o estado pode ter chaves de quem saiu)
    const idsDaPartida = new Set(jogadoresDaPartida.map(p => String(p.id)));
    const notas = Object.fromEntries(
      Object.entries(ratings).filter(([atletaId, nota]) =>
        idsDaPartida.has(String(atletaId)) && typeof nota === 'number' && nota >= 0 && nota <= 10
      )
    );

    if (Object.keys(notas).length === 0) {
      alert('Dê pelo menos uma nota antes de enviar.');
      return;
    }

    setEnviandoNotas(true);
    try {
      const data = await api('/ratings', { method: 'POST', user, body: { match_id: id, ratings: notas } });
      alert(`Avaliação enviada! Você deu nota para ${data?.saved ?? Object.keys(notas).length} atleta(s). Dá para corrigir enquanto o prazo não terminar.`);
      setShowRating(false);
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Erro ao enviar a avaliação', err);
    } finally {
      setEnviandoNotas(false);
    }
  };

  // O prazo acabou com o painel de notas aberto: avisa antes de ele sumir
  const aoVencerPrazoNaAvaliacao = () => {
    alert('O prazo de avaliação terminou. As notas não podem mais ser enviadas.');
    setShowRating(false);
    loadMatch();
  };

  // Encerrar é o que abre o prazo de 12 horas para o pessoal avaliar
  const handleFinishMatch = async () => {
    const confirmado = window.confirm(
      'Encerrar a partida? A partir de agora quem jogou tem 12 horas para dar as notas (dá para mudar o prazo depois), e a escalação fica travada para os demais.'
    );
    if (!confirmado) return;

    try {
      await api(`/matches/${id}`, { method: 'PUT', user, body: { status: 'completed' } });
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Erro ao encerrar a partida', err);
    }
  };

  // Reabrir serve para desfazer um encerramento por engano. O prazo é zerado e
  // volta a contar do zero no próximo encerramento.
  const handleReopenMatch = async () => {
    const confirmado = window.confirm(
      'Reabrir a partida? O prazo de avaliação é zerado e recomeça quando você encerrar de novo. As notas já enviadas são mantidas.'
    );
    if (!confirmado) return;

    try {
      await api(`/matches/${id}`, { method: 'PUT', user, body: { status: 'scheduled' } });
      recarregarSeOcioso();
    } catch (err) {
      avisarErro('Erro ao reabrir a partida', err);
    }
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
    const matchedIds = selectedItems
      .filter(item => item.matchedPlayer)
      .map(item => item.matchedPlayer.id);

    // Linha com atletas empatados e sem escolha não vira cadastro novo
    const newItems = selectedItems.filter(item =>
      !item.matchedPlayer &&
      !((item.candidatos || []).length > 1 && !item.criarNovo) &&
      item.suggestedName && item.suggestedName.trim()
    );

    const newlyCreatedIds = [];
    let falha = null;
    for (const item of newItems) {
      try {
        const nome = item.suggestedName.trim();
        const created = await api('/users', { method: 'POST', user, body: { username: nome, nickname: nome, position: 'MEI' } });
        if (created && created.id) newlyCreatedIds.push(created.id);
      } catch (err) {
        falha = err;
        break;
      }
    }

    // Mesmo se um cadastro falhar no meio, quem já foi cadastrado entra na convocação
    // (repetir a confirmação não duplica: o servidor devolve o atleta que já existe)
    await loadPlayers();
    setSelectedPlayers(prev => Array.from(new Set([...prev, ...matchedIds, ...newlyCreatedIds])));
    setIsCreatingFromWhatsApp(false);

    if (falha) {
      avisarErro('Erro ao cadastrar atletas da lista', falha);
      return;
    }
    setShowWhatsAppModal(false);
  };

  // Campo do placar de um time no cabeçalho
  const campoDoPlacar = (time, cor) => (
    <input
      type="number"
      min="0"
      max="99"
      value={placarDigitado[time.id] ?? String(time.score ?? 0)}
      onFocus={e => e.target.select()}
      onChange={e => handleUpdateTeamScore(time.id, e.target.value, e.target)}
      onBlur={() => esquecerPlacarDigitado(time.id)}
      disabled={!podeEditarPlacar}
      title={DICA_PLACAR}
      aria-label={`Placar de ${time.name}`}
      style={{
        width: '54px',
        height: '52px',
        textAlign: 'center',
        fontSize: '1.8rem',
        fontWeight: '900',
        background: 'rgba(0,0,0,0.7)',
        border: `2px solid ${cor}`,
        borderRadius: '14px',
        color: cor,
        padding: 0,
        margin: 0,
        boxSizing: 'border-box'
      }}
    />
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

      {/* Top Bar with Back, Create Player and Delete Match */}
      <div className="flex justify-between items-center mb-8 gap-4">
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

      {/* A partida está na tela, mas a última atualização falhou */}
      {erroCarga && erroCarga.mensagem && (
        <div role="alert" className="glass-card mb-4" style={{ padding: '10px 14px', borderColor: 'rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '0.82rem' }}>
          <span>Não foi possível atualizar a partida. {erroCarga.mensagem}</span>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', flexShrink: 0 }} onClick={loadMatch}>
            <RefreshCw size={14} /> Tentar de novo
          </button>
        </div>
      )}

      {/* Header Match Score Banner (Symmetrical 3-Column Flex with generous padding) */}
      <div className="glass-card" style={{ padding: '24px 18px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(20,22,34,0.92), rgba(10,32,18,0.9))', borderRadius: '22px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '14px' }}>
          PARTIDA DE {dataDaPartida.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
              <div className="text-muted font-bold mt-1">
                OVR {getTeamOVR(match.teams[0])}
              </div>
            </div>

            {/* Center: Interactive Scoreboard */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', flexShrink: 0 }}>
              {match.teams[0] && campoDoPlacar(match.teams[0], '#00f59b')}
              <span style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--text-muted)' }}>x</span>
              {match.teams[1] && campoDoPlacar(match.teams[1], '#ffffff')}
            </div>

            {/* Right: Time 2 */}
            <div style={{ flex: '1 1 0', textAlign: 'center', minWidth: 0 }}>
              <div className="font-extrabold" style={{ color: '#ffffff', fontSize: 'clamp(1rem, 3.8vw, 1.4rem)', letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="desktop-only">{match.teams[1]?.name || 'COM COLETE'}</span>
                <span className="mobile-only">{formatShortTeamName(match.teams[1]?.name || 'COM COLETE')}</span>
              </div>
              <div className="text-muted font-bold mt-1">
                {isRival ? 'Adversário' : `OVR ${getTeamOVR(match.teams[1])}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted">{isRival ? `Jogo contra ${match.opponent} — escale o time abaixo!` : 'Times a definir — faça a convocação e sorteie as equipes abaixo!'}</div>
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
            <h3 className="font-extrabold text-main flex items-center gap-2" style={{ margin: '0 0 6px' }}>
              <Users color="var(--primary)" size={22} /> 1. Convocação dos Jogadores
            </h3>
            <p className="text-muted" style={{ margin: 0, lineHeight: 1.4 }}>
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

          {/* O elenco não carregou: sem isto a convocação aparecia vazia sem explicação */}
          {erroElenco && (
            <div role="alert" className="mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '0.82rem', color: '#fbbf24' }}>
              <span>Não foi possível carregar o elenco. {erroElenco}</span>
              <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem', flexShrink: 0 }} onClick={loadPlayers}>
                <RefreshCw size={14} /> Tentar de novo
              </button>
            </div>
          )}

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
            <h4 className="font-extrabold text-main flex items-center gap-2 mb-3">
              {isRival ? <><Swords color="var(--primary)" size={20} /> 2. Escalação contra {match.opponent}</> : <><Shuffle color="var(--primary)" size={20} /> 2. Sorteio Ponderado por OVR (COM COLETE vs SEM COLETE)</>}
            </h4>
            <p className="text-muted mb-4">
              {isRival ? 'Todos os convocados formam o time do plugshawty FC. Dá para ajustar a escalação depois.' : 'O algoritmo equilibra automaticamente os dois times pelo OVR de cada atleta, que já reflete o desempenho nas partidas.'}
            </p>
            <button className="btn font-extrabold w-full" onClick={isRival ? saveRivalLineup : () => generateTeamsAuto()} disabled={(isRival ? selectedPlayers.length === 0 : selectedPlayers.length < 2) || !podeMexerNaEscalacao || salvandoEscalacao} style={{ borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              {isRival
                ? <><Swords size={20} /> {salvandoEscalacao ? 'Salvando escalação...' : `Confirmar Escalação (${selectedPlayers.length} Atletas)`}</>
                : <><Shuffle size={20} /> Sortear Equipes Equilibradas ({selectedPlayers.length} Convocados)</>}
            </button>

            {/* Alternativa ao sorteio: escolher o time de cada convocado */}
            {!isRival && (
              <button
                className="btn btn-secondary w-full"
                onClick={() => setShowManualTeams(true)}
                disabled={selectedPlayers.length < 2 || !podeMexerNaEscalacao}
                style={{ marginTop: '10px', padding: '12px 14px', borderRadius: '16px', fontSize: '0.88rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Users size={18} /> Montar Times Manualmente
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cadastro rápido de atleta */}
      {showNewPlayerModal && (
        <NovoAtletaModal
          onClose={() => setShowNewPlayerModal(false)}
          onSave={handleCreateManualPlayer}
        />
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
      {teamsReady && !mostrandoAvaliacao && (
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

            {/* Linha 4: refazer o sorteio com os mesmos atletas (antes de lançar gols) */}
            {podeSortearDeNovo && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', maxWidth: '440px', padding: '10px 18px', fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '14px' }}
                  onClick={handleSortearDeNovo}
                  disabled={Boolean(draftAnim)}
                >
                  <Shuffle size={16} /> Sortear de novo
                </button>
              </div>
            )}
          </div>

          {/* Tudo aqui dentro vira a arte em PNG. Controles que só existem na tela levam a
              classe "no-export" para ficarem de fora da imagem. */}
          <div ref={cardRef} style={{ maxWidth: viewMode === 'pitch' ? '540px' : '960px', width: '100%', margin: '0 auto', padding: '24px 14px 20px', background: '#08090e', borderRadius: '0px', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--primary)', fontWeight: '900', fontSize: '1.35rem', margin: 0, letterSpacing: '-0.3px', textTransform: 'uppercase' }}>
                {isRival ? `plugshawty FC x ${match.opponent}` : 'Escalação Oficial da Partida'}
              </h4>
              <div style={{ color: '#ffffff', fontSize: '0.88rem', marginTop: '6px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {dataDaPartida.toLocaleDateString('pt-BR')} — {match.time || '15h'} — {match.location || 'Arena Petrópolis'}
                <button
                  onClick={() => setEditMatchModal(true)}
                  hidden={!isAdmin}
                  className="no-export"
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}
                  title="Editar Partida"
                  aria-label="Editar Partida"
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
                  <CartaoDoTime
                    key={team.id}
                    team={team}
                    idx={idx}
                    ovrMedio={getTeamOVR(team)}
                    isRival={isRival}
                    podeMexerNaEscalacao={podeMexerNaEscalacao}
                    podeEditarPlacar={podeEditarPlacar}
                    mexendoNaEscalacao={mexendoNaEscalacao}
                    getPlayerEventCount={getPlayerEventCount}
                    onAddPlayer={setShowAddPlayerModal}
                    onOpenPlayer={openPlayerDetails}
                    onSwitchTeam={handleSwitchTeam}
                    onSubstitute={setSubstituteTarget}
                    onRemovePlayer={handleRemovePlayer}
                    onSetEventCount={handleSetPlayerEventCount}
                  />
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
              <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>TEMPORADA {anoDaPartida}</span>
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
          <div className="mt-8">
            <h5 className="font-extrabold mb-3 flex items-center gap-2 text-primary" style={{ fontSize: '0.95rem' }}><Goal size={18} /> Gols Registrados na Partida ({match.goals.length})</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {match.goals.map((g) => (
                <span key={g.id} style={{ background: 'rgba(0,245,155,0.1)', padding: '5px 12px', borderRadius: '12px', fontSize: '0.82rem', border: '1px solid rgba(0,245,155,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Goal size={13} color="var(--primary)" /> <strong>{getPrimaryName(g)}</strong>
                  {/* Excluir é do administrador, e só para gol já gravado: o otimista (id
                      negativo) ainda não existe no servidor */}
                  {podeEditarPlacar && g.id > 0 && (
                    <button
                      type="button"
                      onClick={() => removeEvent('goals', g.id)}
                      title="Excluir este gol"
                      aria-label={`Excluir este gol de ${getPrimaryName(g)}`}
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
          <div className="mt-4">
            <h5 className="font-extrabold mb-3 flex items-center gap-2" style={{ fontSize: '0.95rem' }}><Award size={18} /> Assistências Registradas na Partida ({match.assists.length})</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {match.assists.map((a) => (
                <span key={a.id} style={{ background: 'rgba(251,191,36,0.1)', padding: '5px 12px', borderRadius: '12px', fontSize: '0.82rem', border: '1px solid rgba(251,191,36,0.3)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Footprints size={13} color="#fbbf24" /> <strong>{getPrimaryName(a)}</strong>
                  {podeEditarPlacar && a.id > 0 && (
                    <button
                      type="button"
                      onClick={() => removeEvent('assists', a.id)}
                      title="Excluir esta assistência"
                      aria-label={`Excluir esta assistência de ${getPrimaryName(a)}`}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '28px' }}
          >
            {/* Partida ainda em aberto */}
            {!partidaEncerrada && (isAdmin ? (
              <button
                className="btn font-extrabold"
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
                  {/* Quando o prazo zera, recarrega a partida: o servidor diz que a votação
                      fechou e o botão "Avaliar" some */}
                  <Clock size={14} /> Avaliações abertas por mais <ContadorPrazo terminaEm={match.rating_ends_at} agoraServidor={match.server_now} onExpire={loadMatch} />
                </div>

                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {quantosAvaliaram} de {jogadoresDaPartida.length} atletas já avaliaram
                </div>

                {euJoguei ? (
                  <button
                    className="btn font-extrabold"
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

            {/* Partida encerrada e votação fechada (prazo vencido ou finalizada pelo admin) */}
            {partidaEncerrada && !janelaAberta && (
              <div className="text-center text-muted" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={15} /> Partida encerrada. A votação já foi encerrada
                {quantosAvaliaram > 0 && ` — ${quantosAvaliaram} atleta(s) avaliaram`}.
              </div>
            )}

            {/* Finalizar a votação antes do prazo ou mudar a duração */}
            {isAdmin && partidaEncerrada && (
              <RatingWindowAdmin match={match} user={user} onChanged={loadMatch} />
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
        </>
      )}

      {/* Edit Match Modal */}
      {editMatchModal && (
        <EditarPartidaModal
          match={match}
          isRival={isRival}
          onClose={() => setEditMatchModal(false)}
          onSave={handleUpdateMatchInfo}
        />
      )}

      {/* Add Player to Team Modal */}
      {showAddPlayerModal && (
        <AdicionarJogadorModal
          players={foraDaPartida}
          onClose={() => setShowAddPlayerModal(null)}
          onEscolher={handleAddPlayerToTeam}
        />
      )}

      {/* Substitute Player Modal */}
      {substituteTarget && (
        <SubstituirJogadorModal
          alvo={substituteTarget}
          players={foraDaPartida}
          onClose={() => setSubstituteTarget(null)}
          onEscolher={(novoUserId) => handleReplacePlayer(substituteTarget.user_id, novoUserId)}
        />
      )}

      {/* Vestiário (Avaliação da Partida) */}
      <RatingModal
        isOpen={mostrandoAvaliacao}
        onClose={() => setShowRating(false)}
        match={match}
        ratings={ratings}
        setRatings={setRatings}
        onSubmitRatings={submitRatings}
        jaAvaliei={jaAvaliei}
        user={user}
        getPlayerEventCount={getPlayerEventCount}
        isSubmitting={enviandoNotas}
        onPrazoEncerrado={aoVencerPrazoNaAvaliacao}
      />

      {/* Montagem manual dos times (alternativa ao sorteio) */}
      {showManualTeams && (
        <ManualTeamsModal
          players={allPlayers.filter(p => selectedPlayers.includes(p.id))}
          onClose={() => setShowManualTeams(false)}
          onSave={saveManualTeams}
          isSaving={savingManualTeams}
        />
      )}

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
          // Leva o id do atleta aberto: a tela de atletas abre a edição dele
          const playerId = selectedPlayerModal?.id;
          setSelectedPlayerModal(null);
          navigate('/players', { state: { autoEdit: true, playerId } });
        }}
        allStats={allPlayers}
      />
    </motion.div>
  );
}
