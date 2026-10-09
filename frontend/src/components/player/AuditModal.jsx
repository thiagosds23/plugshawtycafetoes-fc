import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, X, Search, RefreshCw, HardDriveDownload, Trash2, KeyRound, Camera, Edit2, Lock, ClipboardList, Shield, FileSpreadsheet, Zap, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../../utils/api';
import { baixarBackup } from '../../utils/backup';
import { useEscapeKey } from '../../utils/useEscapeKey';

export default function AuditModal({ onClose, adminUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [erro, setErro] = useState('');

  useEscapeKey(onClose);

  // Só a resposta do pedido mais recente vale: clicar em "Atualizar" várias vezes
  // não pode deixar uma resposta antiga sobrescrever a nova
  const pedidoAtual = useRef(0);

  const fetchLogs = useCallback(async () => {
    const pedido = ++pedidoAtual.current;
    setLoading(true);
    setErro('');
    try {
      const data = await api('/audit-logs', { user: adminUser });
      if (pedido !== pedidoAtual.current) return;
      setLogs(Array.isArray(data && data.logs) ? data.logs : []);
    } catch (err) {
      if (pedido !== pedidoAtual.current) return;
      console.error('Erro ao carregar a auditoria:', err);
      setErro(err.message);
    } finally {
      if (pedido === pedidoAtual.current) setLoading(false);
    }
  }, [adminUser]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleClear = async () => {
    if (!window.confirm('Tem certeza que deseja limpar todos os registros de auditoria?')) return;
    try {
      await api('/audit-logs', { method: 'DELETE', user: adminUser });
      setLogs([]);
    } catch (err) {
      alert('Erro ao limpar auditoria: ' + err.message);
    }
  };

  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    try {
      await baixarBackup(adminUser);
      // O servidor registra o download na auditoria: recarrega para ele aparecer
      fetchLogs();
    } catch (err) {
      alert('Erro ao baixar backup: ' + err.message);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'LOGIN':
        return { bg: 'rgba(0, 245, 155, 0.15)', color: '#00f59b', border: 'rgba(0, 245, 155, 0.4)', icon: <KeyRound size={11} /> };
      case 'FOTO':
        return { bg: 'rgba(0, 210, 255, 0.15)', color: '#00d2ff', border: 'rgba(0, 210, 255, 0.4)', icon: <Camera size={11} /> };
      case 'PERFIL':
      case 'POSIÇÃO':
        return { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)', icon: <Edit2 size={11} /> };
      case 'PIN':
        return { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: 'rgba(234, 179, 8, 0.4)', icon: <Lock size={11} /> };
      case 'AVALIAÇÃO':
        return { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)', icon: <ClipboardList size={11} /> };
      case 'ADMIN':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)', icon: <Shield size={11} /> };
      case 'PLANILHA':
        return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)', icon: <FileSpreadsheet size={11} /> };
      default:
        return { bg: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0', border: 'rgba(255, 255, 255, 0.2)', icon: <Zap size={11} /> };
    }
  };

  const filteredLogs = logs.filter(item => {
    const matchesSearch = !search || 
      (item.username && item.username.toLowerCase().includes(search.toLowerCase())) ||
      (item.details && item.details.toLowerCase().includes(search.toLowerCase())) ||
      (item.action && item.action.toLowerCase().includes(search.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (selectedAction === 'ALL') return true;
    return item.action === selectedAction;
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 15 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="glass-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auditoria-titulo"
        style={{
          width: '680px',
          maxWidth: '96vw', 
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 18, 28, 0.98)', 
          border: '1px solid rgba(139, 92, 246, 0.4)', 
          borderRadius: '24px', 
          boxShadow: '0 25px 60px rgba(0,0,0,0.95), 0 0 30px rgba(139, 92, 246, 0.15)', 
          padding: '24px',
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid #8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} color="#c084fc" />
              </div>
              <h3 id="auditoria-titulo" style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                Auditoria do App (Admin)
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Registro de todas as atividades, logins e alterações feitas pelos atletas.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Fechar"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                aria-label="Buscar nos registros de auditoria"
                placeholder="Buscar por atleta ou detalhe..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px 8px 34px', 
                  borderRadius: '10px', 
                  background: 'rgba(255,255,255,0.04)', 
                  border: '1px solid var(--border)', 
                  color: '#fff', 
                  fontSize: '0.82rem' 
                }}
              />
            </div>
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={fetchLogs} 
              disabled={loading}
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Atualizar registros agora"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={handleDownloadBackup} 
              disabled={isExportingBackup}
              style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
              title="Baixar backup completo do banco de dados em JSON"
            >
              <HardDriveDownload size={14} className={isExportingBackup ? 'animate-spin' : ''} />
              {isExportingBackup ? 'Baixando...' : 'Backup (.json)'}
            </button>
            {logs.length > 0 && (
              <button 
                type="button"
                className="btn btn-secondary" 
                onClick={handleClear} 
                style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                title="Limpar histórico"
                aria-label="Limpar histórico de auditoria"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'LOGIN', label: 'Logins' },
              { id: 'FOTO', label: 'Fotos' },
              { id: 'PERFIL', label: 'Perfis' },
              { id: 'PIN', label: 'PINs' },
              { id: 'AVALIAÇÃO', label: 'Avaliações' },
              { id: 'ADMIN', label: 'Admin' }
            ].map(cat => (
              <button 
                key={cat.id}
                type="button"
                onClick={() => setSelectedAction(cat.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  fontWeight: selectedAction === cat.id ? '800' : '500',
                  background: selectedAction === cat.id ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                  color: selectedAction === cat.id ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span>Mostrando <strong>{filteredLogs.length}</strong> de {logs.length} registros</span>
          <span>Atualizado em tempo real</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
              Carregando histórico de auditoria...
            </div>
          ) : erro && logs.length === 0 ? (
            <div role="alert" style={{ textAlign: 'center', padding: '40px', color: '#f87171', fontSize: '0.85rem' }}>
              Não foi possível carregar a auditoria: {erro}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhum registro encontrado para este filtro.
            </div>
          ) : (
            filteredLogs.map(log => {
              const badge = getActionBadge(log.action);
              return (
                <div 
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div 
                      style={{ 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        fontSize: '0.72rem', 
                        fontWeight: '800', 
                        background: badge.bg, 
                        color: badge.color, 
                        border: `1px solid ${badge.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0
                      }}
                    >
                      <span>{badge.icon}</span>
                      <span>{log.action}</span>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fff', lineHeight: 1.2 }}>
                        {log.username}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        {log.details}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0, marginTop: '2px' }}>
                    {log.created_at}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
