import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { AuthProvider, AuthContext } from './AuthContext';
import { LogOut, Home, Trophy, Calendar, Users, Shield, Sparkles, UserCheck } from 'lucide-react';

import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Matches from './components/Matches';
import Players from './components/Players';
import MatchDetails from './components/MatchDetails';
import { API_URL } from './config';

const PrivateRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  return user ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { user } = useContext(AuthContext);
  return user ? <Navigate to="/" /> : children;
};

const Navigation = () => {
  const { user, logout } = useContext(AuthContext);
  
  if (!user) return null;

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img 
            src="/logo.jpeg" 
            alt="Club Crest" 
            style={{ 
              width: '42px', 
              height: '42px', 
              borderRadius: '50%', 
              objectFit: 'cover', 
              border: '2px solid var(--primary)',
              boxShadow: '0 0 12px rgba(0, 245, 155, 0.4)'
            }} 
          />
          <div style={{ position: 'absolute', bottom: -1, right: -1, width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', border: '2px solid #07080c' }}></div>
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', letterSpacing: '-0.3px', background: 'linear-gradient(90deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', whiteSpace: 'nowrap' }}>
            <span className="desktop-only">plugshawtycafetoes FC</span>
            <span className="mobile-only">plugshawty FC</span>
          </h1>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            Temporada 2026
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        {/* User Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '4px 10px 4px 5px', borderRadius: '30px', border: '1px solid var(--border)' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#121520', overflow: 'hidden', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {user.photo ? (
              <img src={`${API_URL}${user.photo}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>{user.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#fff', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.nickname ? user.nickname.split(',')[0].trim() : user.username}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--primary)', fontWeight: '700' }}>{user.position || 'MEI'}</div>
          </div>
        </div>

        <button 
          className="btn btn-secondary" 
          style={{ padding: '8px 10px', fontSize: '0.75rem', width: 'auto', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          onClick={logout}
          title="Encerrar sessão"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
};

const MainNav = () => {
  const { user } = useContext(AuthContext);
  if (!user) return null;
  
  return (
    <nav className="nav-bar desktop-nav">
      <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
        <Trophy size={17} /> Classificação & Ranking
      </NavLink>
      <NavLink to="/matches" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
        <Calendar size={17} /> Partidas & Agenda
      </NavLink>
      <NavLink to="/players" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
        <Users size={17} /> Elenco & Cartas
      </NavLink>
    </nav>
  );
};

const MobileBottomNav = () => {
  const { user } = useContext(AuthContext);
  if (!user) return null;

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/" className={({isActive}) => isActive ? "mobile-tab-item active" : "mobile-tab-item"}>
        <Trophy size={19} />
        <span>Ranking</span>
      </NavLink>
      <NavLink to="/matches" className={({isActive}) => isActive ? "mobile-tab-item active" : "mobile-tab-item"}>
        <Calendar size={19} />
        <span>Partidas</span>
      </NavLink>
      <NavLink to="/players" className={({isActive}) => isActive ? "mobile-tab-item active" : "mobile-tab-item"}>
        <Users size={19} />
        <span>Elenco</span>
      </NavLink>
    </nav>
  );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-card" style={{ padding: '36px 20px', textAlign: 'center', margin: '30px auto', maxWidth: '480px' }}>
          <h3 style={{ color: '#ef4444', marginBottom: '10px', fontSize: '1.2rem', fontWeight: 800 }}>
            Ops! Algo deu errado ao carregar esta tela.
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '20px' }}>
            {this.state.error?.message || 'Erro inesperado na visualização.'}
          </p>
          <button 
            className="btn" 
            style={{ width: 'auto', padding: '10px 24px', margin: '0 auto' }} 
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >
            Recarregar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { user } = useContext(AuthContext);

  if (!user) {
    return (
      <div style={{ height: '100dvh', maxHeight: '100dvh', width: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="container">
      <Navigation />
      <MainNav />
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Navigate to="/" />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/matches" element={<PrivateRoute><Matches /></PrivateRoute>} />
          <Route path="/matches/:id" element={<PrivateRoute><MatchDetails /></PrivateRoute>} />
          <Route path="/players" element={<PrivateRoute><Players /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </ErrorBoundary>
      <MobileBottomNav />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
