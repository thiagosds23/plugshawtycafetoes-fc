import { createContext, useContext } from 'react';

/**
 * Abre, de qualquer tela, o histórico de notas de um atleta (recebidas e dadas,
 * partida por partida). O provedor fica no App (NotasDoAtletaProvider).
 *
 *   const abrirNotas = useNotasDoAtleta();
 *   abrirNotas(atleta);            // { id, username, nickname }
 *   abrirNotas(atleta, matchId);   // já destacando uma partida
 */
export const NotasDoAtletaContext = createContext(() => {});

export const useNotasDoAtleta = () => useContext(NotasDoAtletaContext);
