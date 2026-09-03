import React, { useEffect, useState, useContext } from 'react';
import { Trophy, Star, Goal, Award, ThumbsDown, Crown, Coffee, Calendar, Target, Flame, Activity, TrendingUp, ShieldCheck, Zap, ArrowRight, PlusCircle, Search, User, Footprints, Handshake, Swords, Star as StarIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AuthContext } from '../AuthContext';
import { API_URL, formatPhotoUrl } from '../config';

function getPrimaryName(player) {
  if (!player) return '';
  if (player.nickname && typeof player.nickname === 'string') {
    const first = player.nickname.split(',')[0].trim();
    if (first) return first;
  }
  return player.username || '';
}

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [stats, setStats] = useState([]);
  const [matches, setMatches] = useState([]);
  const [period, setPeriod] = useState('all'); // 'month' or 'all'
  const [tableSearch, setTableSearch] = useState('');

  const currentYear = new Date().getFullYear().toString();
  const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const loadData = () => {
    let url = `${API_URL}/stats`;
    if (period === 'month') {
      url += `?year=${currentYear}&month=${currentMonth}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        const sorted = data.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0) || (b.goals || 0) - (a.goals || 0));
        setStats(sorted);
      });

    fetch(`${API_URL}/matches`)
      .then(res => res.json())
      .then(data => setMatches(data || []));
  };

  useEffect(() => {
    loadData();
  }, [period]);

  // Find user personal stats
  const currentUserStats = stats.find(s => user && s.id === user.id);

  // Top Performers for the Podium
  const topScorer = stats.filter(s => (s.goals || 0) > 0).sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
  const topPlaymaker = stats.filter(s => (s.assists || 0) > 0).sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
  const mvp = stats.filter(s => (s.avg_rating || 0) > 0).sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))[0];

  // Feature 1: Quem Tá Voando (Hot Streak / Melhor Momento Recente)
  const hotPlayer = stats.filter(s => (s.matches_count || 0) > 0)
    .sort((a, b) => {
      const aStreak = a.win_streak || 0;
      const bStreak = b.win_streak || 0;
      if (bStreak !== aStreak) return bStreak - aStreak;
      return (b.avg_rating || 0) - (a.avg_rating || 0) || (b.goals || 0) - (a.goals || 0);
    })[0];

  // Upcoming or Latest Match
  const nextScheduledMatch = matches.find(m => m.status === 'scheduled');
  const latestCompletedMatch = matches.find(m => m.status === 'completed');

  // Feature 3: O Clube em Números (Estatísticas Coletivas)
  const totalCompletedMatches = matches.filter(m => m.status === 'completed').length;
  const totalClubGoals = stats.reduce((acc, p) => acc + (p.goals || 0), 0);
  const totalClubAssists = stats.reduce((acc, p) => acc + (p.assists || 0), 0);
  const avgGoalsPerMatch = totalCompletedMatches > 0 
    ? (totalClubGoals / totalCompletedMatches).toFixed(1) 
    : '0.0';

  // Compute Achievements per player
  const getAchievements = (playerId) => {
    const medals = [];
    if (stats.length === 0) return medals;

    const maxGoals = Math.max(...stats.map(s => s.goals || 0));
    const maxAssists = Math.max(...stats.map(s => s.assists || 0));
    const maxRating = Math.max(...stats.map(s => s.avg_rating || 0));
    const minRating = Math.min(...stats.map(s => (s.avg_rating > 0 ? s.avg_rating : 99)));

    const p = stats.find(s => s.id === playerId);
    if (!p) return medals;

    if (p.goals && p.goals === maxGoals && maxGoals > 0) {
      medals.push({ icon: <Goal size={14} color="#00f59b" />, title: 'Artilheiro da Temporada', bg: 'rgba(0, 245, 155, 0.15)' });
    }
    if (p.assists && p.assists === maxAssists && maxAssists > 0) {
      medals.push({ icon: <Coffee size={14} color="#ffd700" />, title: 'Líder em Assistências', bg: 'rgba(255, 215, 0, 0.15)' });
    }
    if (p.avg_rating && p.avg_rating === maxRating && maxRating > 0) {
      medals.push({ icon: <Crown size={14} color="#ffd700" />, title: period === 'month' ? 'Craque do Mês' : 'MVP da Temporada', bg: 'rgba(255, 215, 0, 0.2)' });
    }
    if (p.avg_rating && p.avg_rating === minRating && minRating < 3 && stats.length > 2) {
      medals.push({ icon: <ThumbsDown size={14} color="#ff3366" />, title: 'Pé Murcho (Café com Leite)', bg: 'rgba(255, 51, 102, 0.15)' });
    }

    return medals;
  };

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.04 } }
  };
  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  const userMatches = currentUserStats ? (currentUserStats.matches_count || 0) : 0;

  // Filtered stats for table search
  const filteredStats = stats.filter(p => 
    (p.nickname || p.username || '').toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      
      {/* 1. Hero Welcome & Personal Performance Banner */}
      <div 
        className="glass-card" 
        style={{ 
          padding: '22px 20px', 
          background: 'linear-gradient(135deg, rgba(16, 22, 38, 0.92), rgba(9, 32, 22, 0.88))', 
          position: 'relative', 
          overflow: 'hidden',
          borderRadius: '24px',
          marginBottom: '32px'
        }}
      >
        <div style={{ position: 'absolute', top: -60, right: -60, width: '240px', height: '240px', background: 'radial-gradient(circle, rgba(0, 245, 155, 0.18), transparent 70%)', pointerEvents: 'none' }}></div>

        {/* Textos em Cima */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.12)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: '800', marginBottom: '10px', letterSpacing: '0.5px' }}>
            <Zap size={13} /> TEMPORADA OFICIAL 2026
          </div>
          
          <h2 className="text-2xl font-extrabold text-main" style={{ margin: '0 0 6px', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Fala, {user ? getPrimaryName(user) : 'Atleta'}! <Swords size={22} color="var(--primary)" />
          </h2>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.45, maxWidth: '620px' }}>
            Acompanhe suas estatísticas individuais, a classificação do elenco e os próximos confrontos do clube.
          </p>
        </div>

        {/* Jogos, Gols, Aproveit. e Nota Média em Baixo, cabendo perfeitamente na tela */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <div className="glass-card" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: '14px', background: 'rgba(0, 245, 155, 0.06)', border: '1px solid rgba(0, 245, 155, 0.2)' }}>
            <div className="text-muted font-bold uppercase tracking-wider" style={{ fontSize: '0.62rem' }}>Jogos</div>
            <div className="font-extrabold text-xl text-primary" style={{ marginTop: '2px' }}>{userMatches}</div>
          </div>
          <div className="glass-card" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <div className="text-muted font-bold uppercase tracking-wider" style={{ fontSize: '0.62rem' }}>Gols</div>
            <div className="font-extrabold text-xl text-main" style={{ marginTop: '2px' }}>{currentUserStats ? (currentUserStats.goals || 0) : 0}</div>
          </div>
          <div className="glass-card" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: '14px', background: 'rgba(251, 191, 36, 0.06)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
            <div className="text-muted font-bold uppercase tracking-wider" style={{ fontSize: '0.62rem' }}>Aproveit.</div>
            <div className="font-extrabold text-xl text-gold" style={{ marginTop: '2px' }}>{currentUserStats ? currentUserStats.win_rate : 0}%</div>
          </div>
          <div className="glass-card" style={{ padding: '12px 4px', textAlign: 'center', borderRadius: '14px', background: 'rgba(0, 229, 255, 0.06)', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
            <div className="text-muted font-bold uppercase tracking-wider" style={{ fontSize: '0.62rem' }}>Nota Média</div>
            <div className="font-extrabold text-xl" style={{ marginTop: '2px', color: '#00e5ff' }}>
              {currentUserStats && currentUserStats.avg_rating > 0 ? currentUserStats.avg_rating.toFixed(1) : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Próxima Partida Widget (Design Moderno, Espaçado e 100% Responsivo no Celular) */}
      {nextScheduledMatch ? (
        <div 
          className="glass-card" 
          style={{ 
            padding: '22px 20px', 
            borderColor: 'rgba(251, 191, 36, 0.35)', 
            background: 'linear-gradient(135deg, rgba(30, 24, 10, 0.5) 0%, rgba(14, 17, 26, 0.95) 100%)', 
            borderRadius: '24px',
            marginBottom: '40px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Top Row: Ícone + Título + Badge */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              {/* Ícone de Calendário com dimensões fixas e respiro */}
              <div 
                style={{ 
                  width: '48px', 
                  height: '48px', 
                  minWidth: '48px', 
                  flexShrink: 0, 
                  borderRadius: '16px', 
                  background: 'rgba(251, 191, 36, 0.12)', 
                  border: '1.5px solid rgba(251, 191, 36, 0.35)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 0 16px rgba(251, 191, 36, 0.15)'
                }}
              >
                <Calendar size={24} color="#fbbf24" />
              </div>

              {/* Informações da Partida */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'inline-flex', marginBottom: '6px' }}>
                  <span 
                    className="badge badge-gold" 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      textAlign: 'center', 
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      letterSpacing: '0.4px'
                    }}
                  >
                    CONVOCAÇÃO ABERTA
                  </span>
                </div>

                <h4 className="font-extrabold text-main" style={{ fontSize: '1.08rem', margin: '0 0 6px', letterSpacing: '-0.3px', lineHeight: 1.25 }}>
                  Próxima Partida: <span style={{ color: '#fff', textTransform: 'capitalize' }}>{new Date(nextScheduledMatch.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </h4>

                <p className="text-muted" style={{ fontSize: '0.80rem', margin: 0, lineHeight: 1.45 }}>
                  Os times ainda não foram sorteados. Acesse para confirmar presença e sortear as equipes da partida!
                </p>
              </div>
            </div>

            {/* Bottom Row: Botão Ver Escalação & Sorteio (Nunca corta no celular) */}
            <div>
              <Link 
                to={`/matches/${nextScheduledMatch.id}`} 
                className="btn" 
                style={{ 
                  width: '100%', 
                  padding: '13px 20px', 
                  fontSize: '0.90rem', 
                  fontWeight: '800',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 0 20px rgba(0, 245, 155, 0.3)'
                }}
              >
                Ver Escalação & Sorteio <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </div>
      ) : latestCompletedMatch && (
        <div 
          className="glass-card" 
          style={{ 
            padding: '22px 20px', 
            background: 'linear-gradient(135deg, rgba(16, 19, 28, 0.8) 0%, rgba(10, 12, 18, 0.95) 100%)', 
            borderRadius: '24px',
            marginBottom: '40px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div 
                style={{ 
                  width: '48px', 
                  height: '48px', 
                  minWidth: '48px', 
                  flexShrink: 0, 
                  borderRadius: '16px', 
                  background: 'rgba(0, 245, 155, 0.12)', 
                  border: '1.5px solid rgba(0, 245, 155, 0.35)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  boxShadow: '0 0 16px rgba(0, 245, 155, 0.15)'
                }}
              >
                <ShieldCheck size={24} color="var(--primary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ÚLTIMA PARTIDA REALIZADA
                </div>
                <div className="font-bold text-main" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>
                  Partida de {new Date(latestCompletedMatch.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>

            <Link 
              to={`/matches/${latestCompletedMatch.id}`} 
              className="btn btn-secondary" 
              style={{ 
                width: '100%', 
                padding: '12px 18px', 
                fontSize: '0.86rem', 
                fontWeight: '700',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px', 
                borderRadius: '12px' 
              }}
            >
              Ver Súmula & Notas <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}

      {/* 3. Feature 3: O Clube em Números (Estatísticas Coletivas da Temporada) */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h3 className="font-extrabold text-xl text-main flex items-center gap-2" style={{ margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            <Activity size={22} color="var(--primary)" /> O Clube em Números
          </h3>
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            Estatísticas gerais acumuladas de todas as partidas da temporada.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px' }}>
          <div className="glass-card" style={{ padding: '18px 16px', textAlign: 'center', borderRadius: '18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Partidas Disputadas</div>
            <div className="font-extrabold text-2xl text-main" style={{ marginTop: '6px' }}>{totalCompletedMatches}</div>
          </div>
          <div className="glass-card" style={{ padding: '18px 16px', textAlign: 'center', borderRadius: '18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gols Marcados</div>
            <div className="font-extrabold text-2xl text-primary" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Goal size={20} />{totalClubGoals}</div>
          </div>
          <div className="glass-card" style={{ padding: '18px 16px', textAlign: 'center', borderRadius: '18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assistências</div>
            <div className="font-extrabold text-2xl text-cyan" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Footprints size={20} />{totalClubAssists}</div>
          </div>
          <div className="glass-card" style={{ padding: '18px 16px', textAlign: 'center', borderRadius: '18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Média de Gols / Jogo</div>
            <div className="font-extrabold text-2xl text-gold" style={{ marginTop: '6px' }}>{avgGoalsPerMatch}</div>
          </div>
        </div>
      </div>

      {/* 4. Destaques Individuais (Podium Cards com Feature 1: Quem Tá Voando) */}
      <div style={{ marginBottom: '20px' }}>
        <h3 className="font-extrabold text-xl text-main flex items-center gap-2" style={{ margin: '0 0 6px', letterSpacing: '-0.3px' }}>
          <Flame size={22} color="#fbbf24" /> Destaques da Temporada
        </h3>
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          Os atletas que lideram as notas médias, a artilharia, as assistências e o momento recente do clube.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '52px' }}>
        {/* MVP Card */}
        <div className="glass-card" style={{ padding: '24px 26px', position: 'relative', overflow: 'hidden', borderColor: 'var(--border-gold)', background: 'linear-gradient(135deg, rgba(30, 24, 10, 0.6), rgba(16, 19, 28, 0.85))', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <span className="badge badge-gold"><Crown size={13} /> {period === 'month' ? 'CRAQUE DO MÊS' : 'MVP DA TEMPORADA'}</span>
              <h4 className="font-extrabold text-xl text-main" style={{ margin: '12px 0 2px' }}>{mvp ? getPrimaryName(mvp) : '-'}</h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{mvp ? (mvp.position || 'MEI') : ''}</div>
            </div>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#0a0a0f', overflow: 'hidden', border: '2px solid var(--gold)', boxShadow: 'var(--glow-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {mvp && mvp.photo ? (
                <img src={formatPhotoUrl(mvp.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Crown size={26} color="var(--gold)" />
              )}
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="text-xs text-muted font-bold tracking-wider uppercase">NOTA MÉDIA</span>
            <span className="font-extrabold text-xl text-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{mvp ? (mvp.avg_rating || 0).toFixed(1) : '0.0'} <StarIcon size={16} fill="#fbbf24" color="#fbbf24" /></span>
          </div>
        </div>

        {/* Feature 1: Quem Tá Voando (Hot Streak) Card */}
        <div className="glass-card" style={{ padding: '24px 26px', position: 'relative', overflow: 'hidden', borderColor: 'rgba(255, 107, 0, 0.4)', background: 'linear-gradient(135deg, rgba(36, 18, 10, 0.6), rgba(16, 19, 28, 0.85))', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <span className="badge" style={{ background: 'rgba(255, 107, 0, 0.15)', color: '#ff7700', border: '1px solid rgba(255, 107, 0, 0.35)' }}>
                <Flame size={13} color="#ff7700" /> QUEM TÁ VOANDO
              </span>
              <h4 className="font-extrabold text-xl text-main" style={{ margin: '12px 0 2px' }}>{hotPlayer ? getPrimaryName(hotPlayer) : '-'}</h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{hotPlayer ? (hotPlayer.position || 'MEI') : ''}</div>
            </div>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#0a0a0f', overflow: 'hidden', border: '2px solid #ff7700', boxShadow: '0 0 16px rgba(255, 107, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {hotPlayer && hotPlayer.photo ? (
                <img src={formatPhotoUrl(hotPlayer.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Flame size={26} color="#ff7700" />
              )}
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="text-xs text-muted font-bold tracking-wider uppercase">SEQUÊNCIA</span>
            <span className="font-extrabold text-xl" style={{ color: '#ff7700' }}>
              {hotPlayer && (hotPlayer.win_streak || 0) > 1 
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{hotPlayer.win_streak} Vitórias <Flame size={16} color="#ff7700" /></span>
                : (hotPlayer && hotPlayer.avg_rating > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{hotPlayer.avg_rating.toFixed(1)} <StarIcon size={16} fill="#fbbf24" color="#fbbf24" /></span> : 'Fase Regular')}
            </span>
          </div>
        </div>

        {/* Top Scorer Card */}
        <div className="glass-card" style={{ padding: '24px 26px', position: 'relative', overflow: 'hidden', borderColor: 'rgba(0, 245, 155, 0.35)', background: 'linear-gradient(135deg, rgba(10, 32, 20, 0.6), rgba(16, 19, 28, 0.85))', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <span className="badge badge-volt"><Goal size={13} /> ARTILHEIRO</span>
              <h4 className="font-extrabold text-xl text-main" style={{ margin: '12px 0 2px' }}>{topScorer ? getPrimaryName(topScorer) : '-'}</h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{topScorer ? (topScorer.position || 'ATA') : ''}</div>
            </div>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#0a0a0f', overflow: 'hidden', border: '2px solid var(--primary)', boxShadow: 'var(--glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {topScorer && topScorer.photo ? (
                <img src={formatPhotoUrl(topScorer.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Goal size={26} color="var(--primary)" />
              )}
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="text-xs text-muted font-bold tracking-wider uppercase">GOLS MARCADOS</span>
            <span className="font-extrabold text-xl text-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{topScorer ? topScorer.goals : 0} <Goal size={16} color="var(--primary)" /></span>
          </div>
        </div>

        {/* Playmaker (Assists) Card */}
        <div className="glass-card" style={{ padding: '24px 26px', position: 'relative', overflow: 'hidden', borderColor: 'rgba(0, 229, 255, 0.35)', background: 'linear-gradient(135deg, rgba(10, 28, 36, 0.6), rgba(16, 19, 28, 0.85))', borderRadius: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
            <div>
              <span className="badge badge-cyan"><Coffee size={13} /> MAIOR GARÇOM</span>
              <h4 className="font-extrabold text-xl text-main" style={{ margin: '12px 0 2px' }}>{topPlaymaker ? getPrimaryName(topPlaymaker) : '-'}</h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{topPlaymaker ? (topPlaymaker.position || 'MEI') : ''}</div>
            </div>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#0a0a0f', overflow: 'hidden', border: '2px solid var(--cyan)', boxShadow: '0 0 16px var(--cyan-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {topPlaymaker && topPlaymaker.photo ? (
                <img src={formatPhotoUrl(topPlaymaker.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Award size={26} color="var(--cyan)" />
              )}
            </div>
          </div>
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="text-xs text-muted font-bold tracking-wider uppercase">ASSISTÊNCIAS</span>
            <span className="font-extrabold text-xl text-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{topPlaymaker ? topPlaymaker.assists : 0} <Footprints size={16} color="var(--cyan)" /></span>
          </div>
        </div>
      </div>

      {/* 5. Tabela de Classificação do Elenco com Feature 2: Forma Recente */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 className="text-2xl font-extrabold text-main" style={{ margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            Classificação do Elenco
          </h3>
          <div className="text-muted text-sm" style={{ margin: 0 }}>
            {period === 'month' ? 'Ranking referente aos jogos do mês atual' : 'Ranking acumulado de toda a temporada'}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
          {/* Quick Search in Table */}
          <div style={{ position: 'relative', flex: '1 1 180px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar atleta..." 
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '0.85rem', marginBottom: 0, borderRadius: '10px', height: '40px' }}
            />
          </div>

          {/* Period Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(14, 16, 23, 0.85)', padding: '5px 6px', borderRadius: '14px', border: '1px solid var(--border)', flexShrink: 0 }}>
            <button 
              className={`btn ${period === 'month' ? '' : 'btn-secondary'}`} 
              style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: period === 'month' ? 800 : 600, width: 'auto', borderRadius: '10px' }} 
              onClick={() => setPeriod('month')}
            >
              Mês Atual
            </button>
            <button 
              className={`btn ${period === 'all' ? '' : 'btn-secondary'}`} 
              style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: period === 'all' ? 800 : 600, width: 'auto', borderRadius: '10px' }} 
              onClick={() => setPeriod('all')}
            >
              Temporada Completa
            </button>
          </div>
        </div>
      </div>

      {/* Visualização Mobile: Cards Elegantes de Ranking (FotMob / Sofascore style) */}
      <div className="mobile-only" style={{ marginTop: '14px' }}>
        <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredStats.map((player, idx) => {
            const isTop3 = idx < 3;
            const posBadgeColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
            const hasMatches = (player.matches_count || 0) > 0;
            
            return (
              <motion.div
                variants={item}
                key={player.id}
                className="glass-card"
                style={{
                  padding: '14px 14px',
                  borderRadius: '16px',
                  border: isTop3 ? `1.5px solid ${posBadgeColors[idx]}40` : '1px solid var(--border)',
                  background: isTop3 ? `linear-gradient(135deg, ${posBadgeColors[idx]}0a, rgba(16, 19, 28, 0.9))` : 'rgba(14, 17, 26, 0.75)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Linha Superior: Posição, Foto, Nome, Posição e Forma Recente */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {/* Badge de Posição */}
                    <div style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '8px', 
                      background: isTop3 ? `${posBadgeColors[idx]}25` : 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${isTop3 ? posBadgeColors[idx] : 'var(--border)'}`,
                      color: isTop3 ? posBadgeColors[idx] : 'var(--text-muted)',
                      fontWeight: 900,
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {idx + 1}
                    </div>

                    {/* Foto */}
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', overflow: 'hidden', border: isTop3 ? `2px solid ${posBadgeColors[idx]}` : '1px solid var(--border)', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {player.photo ? (
                        <img src={formatPhotoUrl(player.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontWeight: 800, color: 'var(--text-muted)', fontSize: '13px' }}>{player.username.charAt(0).toUpperCase()}</span>
                      )}
                    </div>

                    {/* Nome e Posição */}
                    <div style={{ minWidth: 0 }}>
                      <div className="font-extrabold text-main" style={{ fontSize: '0.95rem', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getPrimaryName(player)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{player.position || 'MEI'}</span>
                        <span>•</span>
                        <span>{player.matches_count || 0} jogos</span>
                      </div>
                    </div>
                  </div>

                  {/* Forma Recente (Últimos 5 jogos) */}
                  <div style={{ flexShrink: 0 }}>
                    {player.recent_form && player.recent_form.length > 0 ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {player.recent_form.slice(-5).map((res, i) => (
                          <span 
                            key={i} 
                            style={{ 
                              width: '18px', 
                              height: '18px', 
                              borderRadius: '50%', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              fontSize: '9px', 
                              fontWeight: 900,
                              background: res === 'V' ? 'rgba(0, 245, 155, 0.2)' : res === 'E' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 51, 102, 0.2)',
                              color: res === 'V' ? 'var(--primary)' : res === 'E' ? 'var(--gold)' : 'var(--danger)',
                              border: `1px solid ${res === 'V' ? 'var(--primary)' : res === 'E' ? 'var(--gold)' : 'var(--danger)'}`
                            }}
                          >
                            {res}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>-</span>
                    )}
                  </div>
                </div>

                {/* Linha Inferior: 4 estatísticas completas em cards visíveis de uma vez só! */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 2px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>V / E / D</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                      {hasMatches ? (
                        <>
                          <span className="text-primary">{player.wins || 0}</span>/<span className="text-gold">{player.draws || 0}</span>/<span style={{ color: 'var(--danger)' }}>{player.losses || 0}</span>
                        </>
                      ) : (
                        <span className="text-muted">0/0/0</span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 2px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Aproveit.</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: (player.win_rate || 0) >= 50 ? 'var(--primary)' : 'var(--text-muted)', marginTop: '2px' }}>
                      {player.win_rate || 0}%
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 2px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Gols / Ast</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: 'var(--primary)', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Goal size={13} color="var(--primary)" />{player.goals || 0} <Footprints size={13} color="var(--cyan)" style={{ marginLeft: '4px' }} /><span style={{ color: 'var(--cyan)' }}>{player.assists || 0}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 2px', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Nota Média</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#00e5ff', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      {player.avg_rating && player.avg_rating > 0 ? <><StarIcon size={13} fill="#fbbf24" color="#fbbf24" />{player.avg_rating.toFixed(1)}</> : '-'}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredStats.length === 0 && (
            <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '16px' }}>
              Nenhum atleta encontrado.
            </div>
          )}
        </motion.div>
      </div>

      {/* Visualização Desktop: Tabela Tradicional Larga Completa */}
      <div className="desktop-only glass-card" style={{ padding: '0', overflow: 'hidden', borderRadius: '20px', marginTop: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '18px 24px', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pos / Atleta</th>
                <th style={{ padding: '18px 20px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Últimos 5 Jogos</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>V / E / D</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Aproveit.</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Nota Média</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Gols</th>
                <th style={{ padding: '18px 24px', textAlign: 'center', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Assist.</th>
              </tr>
            </thead>
            <motion.tbody variants={container} initial="hidden" animate="show">
              {filteredStats.map((player, idx) => {
                const isTop3 = idx < 3;
                const posBadgeColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                const hasMatches = (player.matches_count || 0) > 0;
                
                return (
                  <motion.tr variants={item} key={player.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} className="hover:bg-white/5">
                    <td style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* Ranking badge */}
                      <div style={{ 
                        width: '30px', 
                        height: '30px', 
                        borderRadius: '9px', 
                        background: isTop3 ? `${posBadgeColors[idx]}20` : 'rgba(255,255,255,0.04)', 
                        border: `1.5px solid ${isTop3 ? posBadgeColors[idx] : 'var(--border)'}`,
                        color: isTop3 ? posBadgeColors[idx] : 'var(--text-muted)',
                        fontWeight: '900', 
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>

                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--secondary)', overflow: 'hidden', border: isTop3 ? `2px solid ${posBadgeColors[idx]}` : '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {player.photo ? (
                          <img src={formatPhotoUrl(player.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '14px' }}>
                            {player.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-base text-main">{getPrimaryName(player)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>{player.position || 'MEI'}</div>
                      </div>
                    </td>

                    {/* Feature 2: Forma Recente (Últimos 5 Jogos) */}
                    <td style={{ padding: '18px 20px', textAlign: 'center' }}>
                      {player.recent_form && player.recent_form.length > 0 ? (
                        <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center', justifyContent: 'center' }}>
                          {player.recent_form.map((res, i) => (
                            <span 
                              key={i} 
                              title={res === 'V' ? 'Vitória' : res === 'E' ? 'Empate' : 'Derrota'}
                              style={{ 
                                width: '24px', 
                                height: '24px', 
                                borderRadius: '50%', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                fontSize: '11px', 
                                fontWeight: '900',
                                background: res === 'V' ? 'rgba(0, 245, 155, 0.15)' : res === 'E' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 51, 102, 0.15)',
                                color: res === 'V' ? 'var(--primary)' : res === 'E' ? 'var(--gold)' : 'var(--danger)',
                                border: `1.5px solid ${res === 'V' ? 'var(--primary)' : res === 'E' ? 'var(--gold)' : 'var(--danger)'}`,
                                boxShadow: res === 'V' ? '0 0 8px rgba(0, 245, 155, 0.25)' : 'none'
                              }}
                            >
                              {res}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted text-xs font-bold">-</span>
                      )}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {hasMatches ? (
                        <>
                          <span className="text-primary">{player.wins || 0}</span>
                          <span className="text-muted" style={{ margin: '0 4px' }}>/</span>
                          <span className="text-gold">{player.draws || 0}</span>
                          <span className="text-muted" style={{ margin: '0 4px' }}>/</span>
                          <span style={{ color: 'var(--danger)' }}>{player.losses || 0}</span>
                        </>
                      ) : (
                        <span className="text-muted text-xs">0 / 0 / 0</span>
                      )}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem' }}>
                      {hasMatches ? (
                        <span style={{ color: (player.win_rate || 0) >= 50 ? 'var(--primary)' : 'var(--text-muted)' }}>
                          {player.win_rate || 0}%
                        </span>
                      ) : (
                        <span className="text-muted text-xs">0%</span>
                      )}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'center' }}>
                      {player.avg_rating && player.avg_rating > 0 ? (
                        <span style={{ 
                          fontWeight: '900', 
                          fontSize: '0.95rem',
                          color: player.avg_rating >= 4 ? 'var(--primary)' : (player.avg_rating >= 3 ? '#fbbf24' : 'var(--text-muted)'),
                          display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}>
                          <StarIcon size={14} fill={player.avg_rating >= 4 ? 'var(--primary)' : (player.avg_rating >= 3 ? '#fbbf24' : 'var(--text-muted)')} color={player.avg_rating >= 4 ? 'var(--primary)' : (player.avg_rating >= 3 ? '#fbbf24' : 'var(--text-muted)')} />{player.avg_rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">-</span>
                      )}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem' }}>
                      {player.goals > 0 ? (
                        <span className="text-primary">{player.goals}</span>
                      ) : (
                        <span className="text-muted text-xs">0</span>
                      )}
                    </td>

                    <td style={{ padding: '18px 24px', textAlign: 'center', fontWeight: '800', fontSize: '0.95rem' }}>
                      {player.assists > 0 ? (
                        <span className="text-cyan">{player.assists}</span>
                      ) : (
                        <span className="text-muted text-xs">0</span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}

              {filteredStats.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum atleta encontrado.
                  </td>
                </tr>
              )}
            </motion.tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
