import React, { createContext, useState, useEffect } from 'react';
import { API_URL } from './config';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Inicialização síncrona do localStorage
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('pelada_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  // Sincroniza os dados mais recentes do atleta (foto, notas, apelido) a partir do
  // banco na nuvem. Antes isso baixava a lista completa de jogadores só para achar
  // uma linha; agora busca apenas o próprio usuário.
  useEffect(() => {
    if (!user || !user.id) return;
    fetch(`${API_URL}/users/${user.id}`)
      .then(res => (res.ok ? res.json() : null))
      .then(freshUser => {
        if (freshUser && freshUser.id) {
          setUser(prev => {
            const updated = { ...prev, ...freshUser };
            localStorage.setItem('pelada_user', JSON.stringify(updated));
            return updated;
          });
        }
      })
      .catch(err => console.error('Erro ao sincronizar dados do usuário:', err));
  }, [user?.id]);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('pelada_user', JSON.stringify(userData));
  };

  const updateUser = (newFields) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...newFields };
      localStorage.setItem('pelada_user', JSON.stringify(updated));
      return updated;
    });
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('pelada_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
