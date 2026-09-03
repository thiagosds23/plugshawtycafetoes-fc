import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Plus, ChevronRight, Activity, Clock, CheckCircle2, Trash2 } from 'lucide-react';
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
    const res = await fetch(`${API_URL}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: newDate })
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
        >
          <label className="label">Data da Partida</label>
          <div className="flex gap-3 flex-wrap">
            <input type="date" className="input" style={{ marginBottom: 0, flex: '1 1 200px' }} value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
            <button type="submit" className="btn" style={{ width: 'auto', flex: '1 1 120px' }}>Agendar</button>
          </div>
        </motion.form>
      )}

      {Object.keys(groupedMatches).length > 0 ? (
        Object.entries(groupedMatches).map(([monthYear, group]) => (
          <div key={monthYear} className="mb-8">
            <h3 className="text-lg font-bold mb-3 text-primary border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              {monthYear}
            </h3>
            <motion.div variants={container} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {group.map(match => {
                const matchDate = new Date(match.date + 'T12:00:00');
                const formattedDate = isNaN(matchDate.getTime()) ? match.date : matchDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
                
                return (
                  <motion.div variants={item} key={match.id} whileHover={{ scale: 1.01, x: 2 }} whileTap={{ scale: 0.99 }}>
                    <div className="glass-card flex justify-between items-center hover:bg-white/5" style={{ padding: '14px 18px', transition: 'all 0.2s', gap: '12px' }}>
                      <Link to={`/matches/${match.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div style={{ 
                          width: '48px', 
                          height: '48px', 
                          borderRadius: '50%', 
                          background: match.status === 'scheduled' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(57, 255, 20, 0.15)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {match.status === 'scheduled' ? (
                            <Clock size={24} color="#fbbf24" />
                          ) : (
                            <CheckCircle2 size={24} color="var(--primary)" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-xl mb-1 text-main flex items-center gap-2">
                            {formattedDate}
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '500', color: match.status === 'scheduled' ? '#fbbf24' : 'var(--primary)' }}>
                            {match.status === 'scheduled' ? '🟡 Convocação Aberta / A definir times' : '🟢 Partida Encerrada'}
                          </div>
                        </div>
                      </Link>

                      <div className="flex items-center gap-3">
                        <Link to={`/matches/${match.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                          <span style={{ fontSize: '0.85rem' }}>Ver Detalhes</span>
                          <ChevronRight size={18} />
                        </Link>
                        <button 
                          type="button" 
                          onClick={(e) => handleDeleteMatch(match.id, e)} 
                          title="Excluir partida do histórico"
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
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
