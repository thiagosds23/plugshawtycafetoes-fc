import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { LogIn, UserPlus, Phone, Mail, User, KeyRound, Trophy, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_URL } from '../config';

export default function Login() {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const endpoint = isRegistering ? '/register' : '/login';
      const payload = isRegistering 
        ? { username, phone, email, inviteCode } 
        : { username };
      
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao autenticar');
      
      login(data);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="glass-card" 
        style={{ 
          width: '100%', 
          maxWidth: '410px', 
          padding: '24px 22px', 
          background: 'rgba(16, 19, 28, 0.95)', 
          border: '1px solid var(--border)', 
          borderRadius: '22px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 245, 155, 0.08)',
          position: 'relative', 
          overflow: 'hidden' 
        }}
      >
        {/* Subtle Ambient Glow */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: '140px', height: '140px', background: 'radial-gradient(circle, rgba(0, 245, 155, 0.18), transparent 70%)', pointerEvents: 'none' }}></div>

        {/* Club Crest */}
        <div className="flex justify-center" style={{ marginBottom: '12px' }}>
          <div style={{ position: 'relative' }}>
            <img 
              src="/logo.jpeg" 
              alt="Logo" 
              style={{ 
                width: '62px', 
                height: '62px', 
                borderRadius: '50%', 
                objectFit: 'cover',
                border: '2px solid var(--primary)',
                boxShadow: '0 0 22px rgba(0, 245, 155, 0.35)'
              }} 
            />
            <div style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--primary)', color: '#000', borderRadius: '50%', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #07080c' }}>
              <Trophy size={12} />
            </div>
          </div>
        </div>

        {/* Header Titles */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h2 className="text-xl font-extrabold text-main" style={{ margin: '0 0 4px', letterSpacing: '-0.3px', fontSize: '1.25rem' }}>
            plugshawtycafetoes FC
          </h2>
          <p className="text-muted" style={{ fontSize: '0.78rem', margin: 0, lineHeight: 1.35 }}>
            {isRegistering 
              ? 'Crie seu perfil oficial no elenco para desbloquear sua Carta FUT' 
              : 'Entre com seu Usuário, E-mail ou Celular cadastrado'}
          </p>
        </div>

        {/* Tab Switcher com espaçamento */}
        <div style={{ display: 'flex', gap: '8px', padding: '5px 6px', background: 'rgba(8, 10, 15, 0.85)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '16px' }}>
          <button 
            type="button"
            className={`btn ${!isRegistering ? '' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '9px 14px', fontSize: '0.84rem', borderRadius: '10px', fontWeight: !isRegistering ? '800' : '600' }}
            onClick={() => { setIsRegistering(false); setError(''); }}
          >
            <LogIn size={15} /> Entrar
          </button>
          <button 
            type="button"
            className={`btn ${isRegistering ? '' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '9px 14px', fontSize: '0.84rem', borderRadius: '10px', fontWeight: isRegistering ? '800' : '600' }}
            onClick={() => { setIsRegistering(true); setError(''); }}
          >
            <UserPlus size={15} /> Cadastro
          </button>
        </div>
        
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ color: '#ff3366', marginBottom: '12px', textAlign: 'center', fontSize: '0.78rem', background: 'rgba(255, 51, 102, 0.12)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255, 51, 102, 0.3)', fontWeight: '600', lineHeight: 1.3 }}>
            {error}
          </motion.div>
        )}
        
        <form onSubmit={handleSubmit}>
          {!isRegistering ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px', fontSize: '0.74rem' }}>
                  <User size={14} color="var(--primary)" /> USUÁRIO, E-MAIL OU CELULAR
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  placeholder="Ex: jogadordasilva, 5499999"
                  style={{ padding: '11px 14px', fontSize: '0.88rem', marginBottom: 0, borderRadius: '11px' }}
                />
              </div>

              <button type="submit" className="btn w-full" style={{ padding: '12px', fontSize: '0.92rem', fontWeight: '800', marginTop: '4px', borderRadius: '11px' }} disabled={isLoading}>
                {isLoading ? 'Conectando...' : 'Entrar no Sistema'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '0.70rem' }}>
                  <User size={13} color="var(--primary)" /> Nome de Jogador
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  placeholder="Ex: jogadordasilva"
                  style={{ padding: '8px 12px', fontSize: '0.82rem', marginBottom: 0, borderRadius: '9px' }}
                />
              </div>

              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '0.70rem' }}>
                  <Phone size={13} color="var(--primary)" /> Celular / WhatsApp
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required 
                  placeholder="Ex: 54999999999"
                  style={{ padding: '8px 12px', fontSize: '0.82rem', marginBottom: 0, borderRadius: '9px' }}
                />
              </div>

              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '0.70rem' }}>
                  <Mail size={13} color="var(--primary)" /> E-mail de Login
                </label>
                <input 
                  type="email" 
                  className="input" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                  placeholder="Ex: jogador@email.com"
                  style={{ padding: '8px 12px', fontSize: '0.82rem', marginBottom: 0, borderRadius: '9px' }}
                />
              </div>

              <div>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', fontSize: '0.70rem' }}>
                  <KeyRound size={13} color="var(--primary)" /> Código de Convite
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required 
                  placeholder="Ex: JOGO2026"
                  style={{ padding: '8px 12px', fontSize: '0.82rem', marginBottom: 0, borderRadius: '9px' }}
                />
              </div>

              <button type="submit" className="btn w-full" style={{ padding: '11px', fontSize: '0.88rem', fontWeight: '800', marginTop: '4px', borderRadius: '11px' }} disabled={isLoading}>
                {isLoading ? 'Cadastrando...' : 'Criar Conta & Liberar Carta'}
              </button>
            </div>
          )}
        </form>

        {/* Footer Note */}
        <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <span className="text-muted" style={{ fontSize: '0.72rem', letterSpacing: '0.2px' }}>
            Acesso exclusivo aos atletas do <strong>plugshawtycafetoes FC</strong>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
