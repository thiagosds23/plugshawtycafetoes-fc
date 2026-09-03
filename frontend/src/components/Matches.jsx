import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Plus, ChevronRight, Activity, Clock, CheckCircle2, Trash2, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_URL } from '../config';

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const getTodayDate = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [newDate, setNewDate] = useState(getTodayDate);
  const [newTime, setNewTime] = useState('15h');
  const [newLocation, setNewLocation] = useState('Arena Petrópolis');
  const navigate = useNavigate();

  const loadMatches = () => {
    fetch(`${API_URL}/matches`)
      .then(res => res.json())
      .then(data => setMatches(data));
  };

  useEffect(() => {
    loadMatches();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const timeToSend = newTime.trim() || '15h';
    const locToSend = newLocation.trim() || 'Arena Petrópolis';
    const res = await fetch(`${API_URL}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        date: newDate,
        time: timeToSend,
        location: locToSend
      })
    });
    const data = await res.json();
    navigate(`/matches/${data.id}`);
  };

  const handleDeleteMatch = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja excluir esta partida do histórico?')) {
      await fetch(`${API_URL}/matches/${id}`, { method: 'DELETE' });
      loadMatches();
    }
  };

  // Group matches by month
  const groupedMatches = matches.reduce((groups, match) => {
    const d = new Date(match.date + 'T12:00:00');
    const monthYear = isNaN(d.getTime())
      ? 'Outras Partidas'
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalized = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
    
    if (!groups[capitalized]) groups[capitalized] = [];
    groups[capitalized].push(match);
    return groups;
  }, {});

  const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h2 className="font-extrabold flex items-center gap-3 text-main" style={{ fontSize: '1.25rem', margin: 0 }}>
          <div style={{ background: 'rgba(57, 255, 20, 0.1)', padding: '8px', borderRadius: '10px', boxShadow: 'var(--glow)' }}>
            <Calendar color="var(--primary)" size={20} />
          </div>
          Agenda & Histórico
        </h2>
        <button className="btn" style={{ width: 'auto', padding: '9px 18px', fontSize: '0.85rem' }} onClick={() => setIsCreating(!isCreating)}>
          <Plus size={18} /> Nova Partida
        </button>
      </div>

      {isCreating && (
        <motion.form 
          initial={{ height: 0, opacity: 0 }} 
          animate={{ height: 'auto', opacity: 1 }} 
          onSubmit={handleCreate} 
          className="glass-card mb-6"
          style={{ padding: '22px 18px', borderRadius: '18px', border: '1px solid var(--border)' }}
        >
          <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} /> Agendar Nova Partida
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label className="label" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                Data da Partida *
              </label>
              <input 
                type="date" 
                className="input" 
                style={{ marginBottom: 0 }} 
                value={newDate} 
                onChange={(e) => setNewDate(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label className="label" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                Horário (Padrão: 15h)
              </label>
              <input 
                type="text" 
                className="input" 
                style={{ marginBottom: 0 }} 
                placeholder="Ex: 15h ou 16:30" 
                value={newTime} 
                onChange={(e) => setNewTime(e.target.value)} 
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                Local do Jogo (Padrão: Arena Petrópolis)
              </label>
              <input 
                type="text" 
                className="input" 
                style={{ marginBottom: 0 }} 
                placeholder="Ex: Arena Petrópolis" 
                value={newLocation} 
                onChange={(e) => setNewLocation(e.target.value)} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ width: 'auto', padding: '9px 18px' }} onClick={() => setIsCreating(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn" style={{ width: 'auto', padding: '9px 24px', fontWeight: 800 }}>
              Confirmar Agendamento
            </button>
          </div>
        </motion.form>
      )}

      {Object.keys(groupedMatches).length > 0 ? (
        Object.entries(groupedMatches).map(([monthYear, group]) => (
          <div key={monthYear} className="mb-8">
            <h3 className="text-lg font-bold mb-3 text-primary border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              {monthYear}
            </h3>
            <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {group.map(match => {
                const matchDate = new Date(match.date + 'T12:00:00');
                const rawDate = isNaN(matchDate.getTime()) 
                  ? match.date 
                  : matchDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const formattedDate = rawDate ? rawDate.charAt(0).toUpperCase() + rawDate.slice(1) : '';
                
                return (
                  <motion.div variants={item} key={match.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <div 
                      className="glass-card" 
                      style={{ 
                        padding: '20px 18px', 
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, rgba(16, 19, 28, 0.88), rgba(12, 14, 22, 0.96))',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                      }}
                    >
                      {/* Linha Superior: Ícone de Status + Badge + Botão Excluir */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '12px', 
                            background: match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(0, 245, 155, 0.15)', 
                            border: `1.5px solid ${match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.35)' : 'rgba(0, 245, 155, 0.35)'}`,
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {match.status === 'scheduled' ? (
                              <Clock size={20} color="#fbbf24" />
                            ) : (
                              <CheckCircle2 size={20} color="var(--primary)" />
                            )}
                          </div>
                          <span 
                            className="badge" 
                            style={{ 
                              background: match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(0, 245, 155, 0.15)', 
                              color: match.status === 'scheduled' ? '#fbbf24' : 'var(--primary)',
                              border: `1px solid ${match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.35)' : 'rgba(0, 245, 155, 0.35)'}`,
                              fontSize: '0.72rem',
                              padding: '4px 10px',
                              fontWeight: '800'
                            }}
                          >
                            {match.status === 'scheduled' ? 'CONVOCAÇÃO ABERTA' : 'PARTIDA CONCLUÍDA'}
                          </span>
                        </div>

                        <button 
                          type="button" 
                          onClick={(e) => handleDeleteMatch(match.id, e)} 
                          title="Excluir partida do histórico"
                          style={{ 
                            background: 'rgba(239, 68, 68, 0.08)', 
                            border: '1px solid rgba(239, 68, 68, 0.25)', 
                            color: '#ef4444', 
                            borderRadius: '10px', 
                            padding: '8px 10px', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Linha Central: Data Completa, Horário, Local e Descrição */}
                      <div>
                        <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#fff', letterSpacing: '-0.3px', marginBottom: '6px' }}>
                          {formattedDate}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--primary)', fontWeight: 700 }}>
                            <Clock size={14} /> {match.time || '15h'}
                          </span>
                          <span>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#fff', fontWeight: 600 }}>
                            <MapPin size={14} color="#38bdf8" /> {match.location || 'Arena Petrópolis'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {match.status === 'scheduled' 
                            ? 'Acesse para confirmar presenças, sortear os times e gerenciar a partida.' 
                            : 'Partida finalizada. Acesse para conferir os gols, assistências e notas dos atletas.'}
                        </div>
                      </div>

                      {/* Linha Inferior: Botão Amplo de Ação */}
                      <Link 
                        to={`/matches/${match.id}`} 
                        className="btn btn-secondary"
                        style={{ 
                          textDecoration: 'none', 
                          width: '100%', 
                          padding: '11px 16px', 
                          borderRadius: '14px', 
                          fontSize: '0.86rem', 
                          fontWeight: '800',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '8px',
                          background: match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(0, 245, 155, 0.08)',
                          color: match.status === 'scheduled' ? '#fbbf24' : 'var(--primary)',
                          borderColor: match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.35)' : 'rgba(0, 245, 155, 0.35)'
                        }}
                      >
                        <span>{match.status === 'scheduled' ? 'Ver Escalação & Sorteio' : 'Ver Súmula & Estatísticas'}</span>
                        <ChevronRight size={18} />
                      </Link>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        ))
      ) : (
        !isCreating && (
          <div className="text-center text-muted mt-8 text-lg">Nenhuma partida registrada no histórico.</div>
        )
      )}
    </motion.div>
  );
}
