/**
 * Testes de fumaça das telas: cada uma é montada com respostas falsas da API, nos
 * estados principais, e precisa aparecer sem quebrar. Pegam erro de render, hook fora
 * de ordem (React #310), regra de permissão na tela e chamada sem token.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import Login from '../components/Login';
import Dashboard from '../components/Dashboard';
import Matches from '../components/Matches';
import Players from '../components/Players';
import MatchDetails from '../components/MatchDetails';

const ANO = new Date().getFullYear();
const HORA = 3600 * 1000;

const atleta = (id, nome, posicao, extra = {}) => ({
  id, username: nome, nickname: nome, position: posicao, is_admin: 0, has_pin: 1,
  pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 60, physical: 65,
  photo: null, original_photo: null,
  base_attrs: { pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 60, physical: 65 },
  form: null, goals: 0, assists: 0, avg_rating: 0, matches_count: 0, wins: 0, draws: 0, losses: 0,
  win_rate: 0, recent_form: [], win_streak: 0,
  ...extra
});

const ELENCO = [
  atleta(1, 'Fela', 'ATA', { is_admin: 1, goals: 4, assists: 1, avg_rating: 8.1, matches_count: 3, wins: 2, recent_form: ['V', 'V', 'D'], win_streak: 2,
    form: { pace: 1, shooting: 3, passing: 0, dribbling: 2, defending: 1, physical: 1, partidas: 3, nota: 8.1, nota_esperada: 7.2, bonus_gol: 2.4, bonus_assist: 0 } }),
  atleta(2, 'Elias', 'ZAG', { goals: 1, avg_rating: 6.5, matches_count: 3, wins: 1, losses: 2 }),
  atleta(3, 'Stocco', 'LAT', { goals: 2, assists: 1, avg_rating: 7.4, matches_count: 2, wins: 1, draws: 1 }),
  atleta(4, 'Luvluv', 'ZAG', { avg_rating: 6.9, matches_count: 2 })
];

const ADMIN = { ...ELENCO[0], token: 'token-admin' };
const ATLETA = { ...ELENCO[2], token: 'token-atleta' };

const daqui = (h) => new Date(Date.now() + h * HORA).toISOString();
const semFotos = (p) => ({ ...p });

/** Partida no formato que GET /matches/:id devolve. */
function partida(id, extra = {}) {
  return {
    id, date: `${ANO}-10-10`, time: '16h', location: 'Arena Petrópolis', status: 'scheduled', type: 'internal', opponent: null,
    finished_at: null, rating_deadline: null, teams: [], goals: [], assists: [], ratings: [],
    rating_open: false, rating_ends_at: null, rating_hours: null, server_now: new Date().toISOString(), raters: [], my_ratings: {},
    ...extra
  };
}

const ENCERRADA = partida(30, {
  status: 'completed', finished_at: daqui(-2), rating_open: true, rating_ends_at: daqui(10), rating_hours: 12,
  teams: [
    { id: 1, name: 'COM COLETE', manual_score: null, is_opponent: false, score: 2, players: [ELENCO[0], ELENCO[1]].map(semFotos) },
    { id: 2, name: 'SEM COLETE', manual_score: null, is_opponent: false, score: 1, players: [ELENCO[2], ELENCO[3]].map(semFotos) }
  ],
  goals: [{ id: 10, user_id: 1, username: 'Fela', nickname: 'Fela', team_id: 1 }, { id: 11, user_id: 1, username: 'Fela', nickname: 'Fela', team_id: 1 }, { id: 12, user_id: 3, username: 'Stocco', nickname: 'Stocco', team_id: 2 }],
  raters: [1]
});
const AGENDADA = partida(32);
const RIVAL = partida(33, {
  type: 'rival', opponent: 'Real Madruga',
  teams: [
    { id: 5, name: 'plugshawty FC', manual_score: null, is_opponent: false, score: 0, players: [ELENCO[0], ELENCO[2]].map(semFotos) },
    { id: 6, name: 'Real Madruga', manual_score: null, is_opponent: true, score: 0, players: [] }
  ]
});
// GET /matches devolve só as colunas da partida, sem times, gols e notas
const COLUNAS_DA_LISTA = ['id', 'date', 'time', 'location', 'status', 'type', 'opponent', 'finished_at', 'rating_deadline'];
const PARTIDAS = [ENCERRADA, AGENDADA, RIVAL].map(p => Object.fromEntries(COLUNAS_DA_LISTA.map(c => [c, p[c]])));

let chamadas;

/** fetch falso que responde pelas rotas da API e registra o que foi pedido. */
function mockApi(rotas = {}) {
  chamadas = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, opcoes = {}) => {
    const caminho = String(url).replace(/^https?:\/\/[^/]+/, '');
    const metodo = opcoes.method || 'GET';
    chamadas.push({ metodo, caminho, auth: opcoes.headers && opcoes.headers.Authorization });
    const chave = `${metodo} ${caminho.split('?')[0]}`;
    const resposta = rotas[chave] !== undefined ? rotas[chave] : padrao(metodo, caminho);
    const [status, corpo] = Array.isArray(resposta) && typeof resposta[0] === 'number' ? resposta : [200, resposta];
    return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

function padrao(metodo, caminho) {
  if (metodo !== 'GET') return { success: true };
  if (caminho.startsWith('/stats')) return ELENCO;
  if (caminho === '/matches') return PARTIDAS;
  const m = caminho.match(/^\/matches\/(\d+)$/);
  if (m) return [ENCERRADA, AGENDADA, RIVAL].find(p => p.id === Number(m[1])) || [404, { error: 'Partida não encontrada' }];
  if (/^\/users\/\d+\/history/.test(caminho)) return [];
  const u = caminho.match(/^\/users\/(\d+)$/);
  if (u) return ELENCO.find(p => p.id === Number(u[1]));
  return [404, { error: 'rota sem mock' }];
}

function montar(elemento, { user = ADMIN, rota = '/', caminho = '/' } = {}) {
  const valor = { user, login: vi.fn(), logout: vi.fn(), updateUser: vi.fn() };
  return {
    ...render(
      <AuthContext.Provider value={valor}>
        <MemoryRouter initialEntries={[rota]}>
          <Routes>
            <Route path={caminho} element={elemento} />
            <Route path="*" element={<div>outra tela</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    ),
    auth: valor
  };
}

const telaDaPartida = (id, opcoes = {}) => montar(<MatchDetails />, { ...opcoes, rota: `/matches/${id}`, caminho: '/matches/:id' });

beforeEach(() => mockApi());

describe('Login', () => {
  it('pede o PIN de quem tem PIN, sem expor o id', async () => {
    mockApi({ 'POST /login': { requiresPin: true, username: 'Fela', nickname: 'Fela', photo: null } });
    montar(<Login />, { user: null });
    fireEvent.change(screen.getByLabelText(/usuário, e-mail ou celular/i), { target: { value: 'fela' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar no sistema/i }));
    expect(await screen.findByText(/Olá, Fela!/)).toBeTruthy();
    expect(screen.getByLabelText('PIN').getAttribute('inputmode')).toBe('numeric');
  });

  it('admin sem PIN não tem como pular a criação do PIN', async () => {
    mockApi({ 'POST /login': { askInitialPin: true, pinRequired: true, user: { ...ADMIN, has_pin: false } } });
    montar(<Login />, { user: null });
    fireEvent.change(screen.getByLabelText(/usuário, e-mail ou celular/i), { target: { value: 'fela' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar no sistema/i }));
    expect(await screen.findByText(/Crie seu PIN de administrador/)).toBeTruthy();
    expect(screen.queryByText(/Entrar sem PIN/)).toBeNull();
    expect(screen.queryByText(/Não quero PIN agora/)).toBeNull();
  });

  it('cria o PIN com o token da sessão e guarda o token novo', async () => {
    mockApi({
      'POST /login': { askInitialPin: true, pinRequired: false, user: { ...ATLETA, has_pin: false } },
      'POST /users/3/pin': { success: true, has_pin: true, token: 'token-novo' }
    });
    const { auth } = montar(<Login />, { user: null });
    fireEvent.change(screen.getByLabelText(/usuário, e-mail ou celular/i), { target: { value: 'stocco' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar no sistema/i }));
    fireEvent.change(await screen.findByLabelText(/PIN DE 4 DÍGITOS/), { target: { value: '12ab34' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar PIN/ }));
    await waitFor(() => expect(auth.login).toHaveBeenCalled());
    expect(auth.login.mock.calls[0][0].token).toBe('token-novo');
    const pedido = chamadas.find(c => c.caminho === '/users/3/pin');
    expect(pedido.auth).toBe('Bearer token-atleta');
  });
});

describe('Ranking', () => {
  it('mostra o elenco e pede a temporada do ano atual', async () => {
    montar(<Dashboard />);
    expect((await screen.findAllByText('Stocco')).length).toBeGreaterThan(0);
    expect(chamadas.some(c => c.caminho.startsWith(`/stats?year=${ANO}`))).toBe(true);
  });

  it('não quebra se o servidor falhar', async () => {
    mockApi({ 'GET /stats': [500, { error: 'falhou' }], 'GET /matches': [500, { error: 'falhou' }] });
    montar(<Dashboard />);
    expect(await screen.findByText(/Classificação do Elenco/)).toBeTruthy();
  });
});

describe('Agenda', () => {
  it('lista as partidas e só o admin vê o botão de nova partida', async () => {
    montar(<Matches />, { user: ATLETA });
    expect((await screen.findAllByText(/Real Madruga/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Nova Partida/ })).toBeNull();
  });
});

describe('Elenco', () => {
  it('mostra as cartas', async () => {
    montar(<Players />, { user: ATLETA, rota: '/players', caminho: '/players' });
    expect((await screen.findAllByText('Luvluv')).length).toBeGreaterThan(0);
  });
});

describe('Tela da partida', () => {
  it('partida inexistente mostra aviso em vez de travar', async () => {
    telaDaPartida(999);
    expect(await screen.findByText('Partida não encontrada')).toBeTruthy();
  });

  it('convocação: montar os times à mão abre o modal com os convocados', async () => {
    telaDaPartida(32);
    const botaoManual = await screen.findByRole('button', { name: /Montar Times Manualmente/ });
    expect(botaoManual.disabled).toBe(true);
    fireEvent.click(await screen.findByText('Elias'));
    fireEvent.click(screen.getByText('Luvluv'));
    expect(botaoManual.disabled).toBe(false);
    fireEvent.click(botaoManual);
    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Elias')).toBeTruthy();
    expect(within(modal).getByRole('button', { name: /Salvar Times/ }).disabled).toBe(true);
  });

  it('encerrada com votação aberta: admin vê os controles da votação', async () => {
    telaDaPartida(30);
    expect(await screen.findByRole('button', { name: /Finalizar votação/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Alterar duração/ })).toBeTruthy();
    expect(screen.getAllByTitle('Tirar da partida').length).toBe(4);
    expect(chamadas.find(c => c.caminho === '/matches/30').auth).toBe('Bearer token-admin');
  });

  it('encerrada: atleta comum não vê controles do admin e pode avaliar', async () => {
    telaDaPartida(30, { user: ATLETA });
    const avaliar = await screen.findByRole('button', { name: /Avaliar os atletas/ });
    expect(screen.queryByRole('button', { name: /Finalizar votação/ })).toBeNull();
    // Os chips de gol não oferecem excluir para quem não é admin
    expect(screen.queryByTitle(/Excluir este gol/)).toBeNull();
    fireEvent.click(avaliar);
    expect(await screen.findByText(/Vestiário/)).toBeTruthy();
  });

  it('jogo rival: sem trocar de time e sem o time adversário na escalação', async () => {
    telaDaPartida(33);
    await screen.findAllByText('Stocco');
    const trocar = screen.queryAllByTitle(/Trocar de time/);
    expect(trocar.every(b => b.hidden || b.closest('[hidden]'))).toBe(true);
    expect(screen.getAllByTitle('Tirar da partida').length).toBe(2);
  });
});
