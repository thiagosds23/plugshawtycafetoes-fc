import React, { createContext, useState, useEffect, useCallback } from 'react';
import { API_URL, authHeaders } from './config';
import { fetchAcompanhado } from './utils/api';

// eslint-disable-next-line react-refresh/only-export-components -- o contexto é usado em todo o app
export const AuthContext = createContext();

const CHAVE = 'pelada_user';

function salvar(user) {
  try {
    if (user) localStorage.setItem(CHAVE, JSON.stringify(user));
    else localStorage.removeItem(CHAVE);
  } catch (err) {
    console.error('Não foi possível guardar a sessão no navegador:', err);
  }
}

export const AuthProvider = ({ children }) => {
  // Inicialização síncrona do localStorage. Sessões antigas, de antes do token
  // assinado, não valem mais: o atleta entra de novo uma vez.
  const [user, setUser] = useState(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      return salvo && salvo.token ? salvo : null;
    } catch {
      return null;
    }
  });

  const logout = useCallback(() => {
    setUser(null);
    salvar(null);
  }, []);

  // Uma chamada à API recusada por sessão expirada (401) desloga o usuário
  useEffect(() => {
    window.addEventListener('sessao-expirada', logout);
    return () => window.removeEventListener('sessao-expirada', logout);
  }, [logout]);

  // Sincroniza os dados mais recentes do atleta (foto, notas, apelido) a partir do
  // banco na nuvem, só do próprio usuário
  const userId = user?.id;
  const token = user?.token;
  useEffect(() => {
    if (!userId || !token) return;
    fetchAcompanhado(`${API_URL}/users/${userId}`, { headers: authHeaders({ token }) })
      .then(res => (res.ok ? res.json() : null))
      .then(freshUser => {
        if (freshUser && freshUser.id) {
          setUser(prev => {
            if (!prev) return prev;
            // O token continua o da sessão: a resposta não traz um novo
            const updated = { ...prev, ...freshUser, token: prev.token };
            salvar(updated);
            return updated;
          });
        }
      })
      .catch(err => console.error('Erro ao sincronizar dados do usuário:', err));
  }, [userId, token]);

  const login = (userData) => {
    setUser(userData);
    salvar(userData);
  };

  const updateUser = (newFields) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...newFields };
      salvar(updated);
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
