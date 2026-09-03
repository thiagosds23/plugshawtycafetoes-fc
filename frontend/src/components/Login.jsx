import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { LogIn, UserPlus, Phone, Mail, User, KeyRound, Trophy, ArrowRight, ShieldCheck, ArrowLeft, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_URL, formatPhotoUrl } from '../config';

export default function Login() {
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [pinInput, setPinInput] = useState('');
  
  // Steps: 'initial' | 'enter_pin' | 'ask_define_pin'
  const [pinStep, setPinStep] = useState('initial');
  const [matchedUser, setMatchedUser] = useState(null);
  const [pendingUser, setPendingUser] = useState(null);

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleInitialSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      if (isRegistering) {
        const res = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, phone, email, inviteCode })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar atleta');
        
        // Após cadastrar, oferece definir PIN opcional
        setPendingUser(data);
        setPinStep('ask_define_pin');
        return;
      }

      // Login regular
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao autenticar');
      
      if (data.requiresPin) {
        // Usuário já possui um PIN cadastrado: pede o PIN
        setMatchedUser(data);
        setPinStep('enter_pin');
        setPinInput('');
        return;
      }

      if (data.askInitialPin) {
        // Primeiro login sem PIN: pergunta se quer definir
        setPendingUser(data.user);
        setPinStep('ask_define_pin');
        setPinInput('');
        return;
      }

      login(data);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: matchedUser.username, pin: pinInput })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN incorreto');

      login(data);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePinAndEnter = async () => {
    if (!pendingUser) return;
    setError('');
    setIsLoading(true);

    try {
      if (pinInput.trim()) {
        await fetch(`${API_URL}/users/${pendingUser.id}/pin`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': String(pendingUser.id)
          },
          body: JSON.stringify({ pin: pinInput.trim() })
        });
        login({ ...pendingUser, has_pin: true });
      } else {
        login(pendingUser);
      }
      navigate('/');
    } catch (err) {
      console.error(err);
      // Mesmo se der erro ao salvar pin, deixa entrar
      login(pendingUser);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterWithoutPin = async () => {
    if (pendingUser) {
      try {
        await fetch(`${API_URL}/users/${pendingUser.id}/skip-pin`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': String(pendingUser.id)
          }
        });
      } catch (e) {
        console.error('Erro ao registrar skip pin:', e);
      }
      login(pendingUser);
      navigate('/');
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
            {pinStep === 'enter_pin' && 'Conta protegida por PIN'}
            {pinStep === 'ask_define_pin' && 'Configuração de Segurança'}
            {pinStep === 'initial' && (isRegistering 
              ? 'Crie seu perfil oficial no elenco para desbloquear sua Carta FUT' 
              : 'Entre com seu Usuário, E-mail ou Celular')}
          </p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} style={{ color: '#ff3366', marginBottom: '12px', textAlign: 'center', fontSize: '0.78rem', background: 'rgba(255, 51, 102, 0.12)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255, 51, 102, 0.3)', fontWeight: '600', lineHeight: 1.3 }}>
            {error}
          </motion.div>
        )}

        {/* STEP 1: INITIAL LOGIN / REGISTER */}
        {pinStep === 'initial' && (
          <>
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

            <form onSubmit={handleInitialSubmit}>
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
                      placeholder="Ex: thiago silva, Fela, 5499999"
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
          </>
        )}

        {/* STEP 2: DIGITAR PIN DE CONTA PROTEGIDA */}
        {pinStep === 'enter_pin' && matchedUser && (
          <form onSubmit={handleVerifyPinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--secondary)', overflow: 'hidden', margin: '0 auto 8px', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {matchedUser.photo ? (
                  <img src={formatPhotoUrl(matchedUser.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--primary)' }}>{matchedUser.username.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="font-extrabold text-main" style={{ fontSize: '1rem' }}>
                Olá, {matchedUser.nickname ? matchedUser.nickname.split(',')[0].trim() : matchedUser.username}! 👋
              </div>
              <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                Digite seu PIN de 4 dígitos para acessar sua conta
              </p>
            </div>

            <div>
              <input 
                type="password"
                maxLength={6}
                autoFocus
                className="input" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                required 
                placeholder="••••"
                style={{ 
                  textAlign: 'center', 
                  fontSize: '1.6rem', 
                  letterSpacing: '10px', 
                  padding: '10px 14px', 
                  marginBottom: 0, 
                  borderRadius: '12px',
                  border: '1.5px solid var(--primary)'
                }}
              />
            </div>

            <button type="submit" className="btn w-full" style={{ padding: '12px', fontSize: '0.92rem', fontWeight: '800', borderRadius: '11px' }} disabled={isLoading || !pinInput}>
              {isLoading ? 'Verificando...' : 'Confirmar PIN & Entrar'}
            </button>

            <button 
              type="button" 
              className="btn btn-secondary w-full" 
              style={{ padding: '9px', fontSize: '0.80rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => { setPinStep('initial'); setPinInput(''); setError(''); }}
            >
              <ArrowLeft size={14} /> Trocar de Usuário
            </button>

            <div style={{ textAlign: 'center', marginTop: '4px' }}>
              <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                Esqueceu seu PIN? Peça ao Thiago para resetar.
              </span>
            </div>
          </form>
        )}

        {/* STEP 3: DEFINIR PIN OPCIONAL NO PRIMEIRO LOGIN */}
        {pinStep === 'ask_define_pin' && pendingUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ textAlign: 'center', background: 'rgba(0, 245, 155, 0.05)', padding: '16px 14px', borderRadius: '16px', border: '1px solid rgba(0, 245, 155, 0.25)' }}>
              <ShieldCheck color="var(--primary)" size={32} style={{ margin: '0 auto 8px' }} />
              <h3 className="font-extrabold text-main" style={{ fontSize: '1rem', margin: '0 0 6px' }}>
                Deseja definir um PIN de segurança?
              </h3>
              <p className="text-muted text-xs" style={{ margin: 0, lineHeight: 1.4 }}>
                Com um PIN simples de 4 números (ex: <strong>1234</strong>), apenas você poderá editar sua foto, dados e atributos da sua Carta FUT.
              </p>
            </div>

            <div>
              <label className="label text-xs font-bold" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                <KeyRound size={14} color="var(--primary)" /> PIN DE 4 DÍGITOS (OPCIONAL)
              </label>
              <input 
                type="password"
                maxLength={6}
                autoFocus
                className="input" 
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Ex: 1234 (Opcional)"
                style={{ 
                  textAlign: 'center', 
                  fontSize: pinInput ? '1.4rem' : '0.92rem', 
                  letterSpacing: pinInput ? '8px' : '0.5px', 
                  padding: '11px 14px', 
                  marginBottom: 0, 
                  borderRadius: '12px',
                  border: '1.5px solid var(--primary)'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pinInput.trim() ? (
                <button 
                  type="button" 
                  className="btn w-full" 
                  style={{ padding: '12px', fontSize: '0.90rem', fontWeight: '800', borderRadius: '11px' }} 
                  onClick={handleSavePinAndEnter}
                  disabled={isLoading}
                >
                  <Shield size={16} /> Salvar PIN & Entrar
                </button>
              ) : (
                <button 
                  type="button" 
                  className="btn w-full" 
                  style={{ padding: '12px', fontSize: '0.90rem', fontWeight: '800', borderRadius: '11px' }} 
                  onClick={handleEnterWithoutPin}
                  disabled={isLoading}
                >
                  Entrar sem PIN
                </button>
              )}

              {pinInput.trim() && (
                <button 
                  type="button" 
                  className="btn btn-secondary w-full" 
                  style={{ padding: '10px', fontSize: '0.82rem', borderRadius: '10px' }} 
                  onClick={handleEnterWithoutPin}
                  disabled={isLoading}
                >
                  Não quero PIN agora, entrar direto
                </button>
              )}
            </div>
          </div>
        )}

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
