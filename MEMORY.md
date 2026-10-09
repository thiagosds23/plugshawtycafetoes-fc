# Memória do Projeto: plugshawtycafetoes FC

Este arquivo serve como um histórico de tudo que foi planejado e desenvolvido até agora, para que você possa continuar o desenvolvimento em um novo chat sem perder o contexto do que já fizemos.

## 🛠️ Stack Tecnológica
- **Frontend:** React 19 + Vite 8, Framer Motion, Lucide Icons, html-to-image, CSS puro estruturado.
  As telas são carregadas sob demanda (`React.lazy` em `App.jsx`).
- **Backend:** Node.js 22 + Express 5, banco **Turso** (libSQL) via `@libsql/client`. Sem as
  variáveis do Turso, o desenvolvimento local usa o arquivo `backend/database.sqlite` com o
  mesmo cliente. Como rodar e quais variáveis de ambiente existem: ver `README.md`.
- **Módulos do backend:** `server.js` (rotas), `db.js` (conexão + `all/get/run/batch`),
  `auth.js` (token, PIN, login), `evolucao.js` (prazo da votação e evolução das cartas, sem
  banco), `schema.js` (tabelas e migrações). Testes em `backend/test/` e testes de
  fumaça das telas em `frontend/src/test/` (vitest + jsdom, API falsa) — `npm test` na raiz roda os dois.

---

## ⚽ Funcionalidades Implementadas

### 1. Sistema de Jogadores e Cartas estilo FIFA (FUT)
- **Atributos (0-99):** Pace (PAC), Shooting (SHO), Passing (PAS), Dribbling (DRI), Defending (DEF) e Physical (PHY).
- **Overall (OVR):** Calculado automaticamente a partir da média dos 6 atributos.
- **Design das Cartas:** Fundo real (`fut-bg.png` em `frontend/public/`) com enquadramento percentual em `fut-card.css`.
- **Edição & Exclusão Limpa:** Formato de card em vidro com upload de foto e exclusão com limpeza de estado em cascata.

### 2. Sorteio Inteligente de Equipes por OVR (Snake Draft Ponderado)
- **Força usada:** só o `calcOVR` do atleta, que já vem evoluído pelo desempenho (ver
  "Evolução das Cartas"). Somar a nota média de novo contaria o desempenho duas vezes.
- **Snake Draft:** Distribuição balanceada dos convocados entre COM COLETE e SEM COLETE.
- **Alternativa manual:** `ManualTeamsModal` deixa escolher o time de cada convocado.
- **Indicador em Tempo Real:** Exibe o OVR médio de cada equipe (`calcTeamOVR`) e placar da partida.

### 3. 📸 Gerador de Arte da Escalação para WhatsApp (Killer Feature)
- Botão **"Exportar Escalação (WhatsApp)"** na tela da partida (`MatchDetails.jsx`).
- Converte o card visual da escalação (COM COLETE x SEM COLETE, com fotos e OVR) em PNG.
  Controles de tela dentro do card levam a classe `no-export` para não sair na imagem.

### 4. Agenda & Histórico Agrupado por Mês (`Matches.jsx`)
- Agrupamento mensal automático (ex: *Setembro 2026*, *Agosto 2026*).
- Status visuais nítidos: `🟡 Convocação Aberta / A definir times` vs `🟢 Partida Encerrada`.

### 5. Hall da Fama & Ranking do Mês vs Temporada (`Dashboard.jsx`)
- **Filtro de Período:** Alternador entre `Mês Atual` (Craque do Mês) e a temporada (ano atual).
- **Resumo de Carreira V/E/D:** Exibe Vitórias, Empates, Derrotas e % de Aproveitamento de cada jogador.
- **Conquistas Automatizadas (Badges):** `getPlayerAchievements` em `formatters.js` é a única
  regra de medalhas (Artilheiro, Garçom, Craque do Mês/MVP, Xerife etc.).

---

## 💡 Skills Instaladas no Projeto & Antigravity
- **Locais (`.agents/skills/` e orquestrador `.agents/skills.json`, só na máquina — a pasta
  `.agents/` está no `.gitignore`):**
  - `fut-card-engine`: Regras de OVR posicional, enquadramento e Tiers visuais (Special 85+, Gold 75-84, Silver 65-74, Bronze <65).
  - `team-balancer-rules`: Algoritmo Snake Draft por OVR efetivo e suporte a partidas rivais vs rachas internos.
  - `pelada-achievements`: Lógica automatizada de medalhas/badges (*Artilheiro*, *Garçom*, *MVP/Craque*, *Quem Tá Voando*, *Paredão/Xerife*, *Café com Leite*).
- **Globais:** `find-skills`, `frontend-design`, `webapp-testing`, `sqlite-database-expert`, `vercel-react-best-practices`, `react-doctor`, `improve-codebase-architecture`, `grill-me`, `grill-with-docs`, `tdd`, `setup-matt-pocock-skills`, `react-email`, `stitch::react-components`.

---

## 🏗️ Arquitetura Modular do Frontend
Para garantir manutenibilidade, carregamento rápido e respeitar os limites de Fast Refresh do Vite, os componentes monolíticos foram decompostos em submódulos especializados:

### Subcomponentes de Atleta (`frontend/src/components/player/`)
- `PhotoAdjustModal.jsx`: Recorte, zoom e remoção inteligente de fundo por IA (@imgly/background-removal) com fallback WebGPU/WASM.
- `EditPlayerModal.jsx`: Edição completa de perfil, múltiplos apelidos, dados antropométricos e PIN de segurança.
- `AuditModal.jsx`: Auditoria de ações administrativas e download seguro do banco JSON.
- `PlayerDetailsModal.jsx`: Modal unificado de estatísticas, histórico de jogos, badges e variação de atributos (`ResumoForma`), compartilhado entre `Players.jsx` e `MatchDetails.jsx`.

### Subcomponentes de Partida (`frontend/src/components/match/`)
- `TacticalPitch.jsx`: Campo tático interativo estilo transmissão EA Sports FC (abas Time Jamaica / Roots ou Time Único em jogos rivais).
- `DraftAnimation.jsx`: Sorteio cinemático com efeitos sonoros sintéticos via Web Audio API (`playDraftSound`, `playCelebrationSound`).
- `WhatsAppImportModal.jsx`: Parser inteligente de lista de convocados do WhatsApp com fuzzy matching de apelidos.
- `RatingModal.jsx`: Painel de avaliação pós-jogo com contagem regressiva de 12h ajustada para relógio do servidor e sliders táteis 0-10.

### Utilitários Centralizados & Componente FUT
- `frontend/src/components/FutCard.jsx`: Carta interativa com bordas luminosas, suporte a 4 tiers (Special/Gold/Silver/Bronze) e tamanhos (`normal`, `sm`, `xs`).
- `frontend/src/utils/formatters.js`: Fonte única da verdade para formatação de nomes (`getPrimaryName`), notas (`formatarNota`, `corDaNota`), nomes curtos (`formatShortTeamName`) e badges (`getPlayerAchievements`).

---

## 🗄️ Banco de Dados & Turso
- **Schema versionado (`backend/schema.js`):** as tabelas são criadas com `CREATE TABLE IF NOT
  EXISTS` a cada boot (no Turso não muda nada; num banco vazio o app sobe completo). Coluna
  nova entra em `COLUNAS` como `ALTER TABLE`; índice novo em `INDICES`. Migração de DADOS
  usa `aplicarUmaVez(nome, fn)` — nunca rode conversão de dados a cada boot.
- **Credenciais só por variável de ambiente** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
  O token antigo ficou exposto no histórico público do repositório e precisa ser revogado.
- **Transações:** escrita que mexe em várias linhas (excluir partida/atleta, salvar times,
  gols, notas, tirar jogador) usa `db.batch([...])`: ou tudo entra, ou nada. Comando que
  depende do id criado na mesma transação usa `(SELECT MAX(id) FROM ...)`.
- **Índices:** `idx_team_players_team/user`, `idx_goals_match_user`, `idx_assists_match_user`,
  `idx_ratings_match_rater`, `idx_matches_date_status`, `idx_teams_match`, e os únicos
  `ux_ratings_unicas` e `ux_team_players` (um atleta uma vez por time).
- **Cache da evolução:** `obterFormas()` guarda o cálculo por até 1 minuto e é descartado a
  cada requisição de escrita (qualquer método fora GET).


---

## ⚔️ Jogos Contra Rival

`matches.type` é `'internal'` (racha entre o elenco, com sorteio) ou `'rival'` (contra outro time).
Nas partidas contra rival, `matches.opponent` guarda o nome do adversário.

**O adversário é um registro em `teams` com `is_opponent = 1` e sem jogadores.** Isso é de
propósito: placar, vitórias/derrotas do ranking, avaliação e evolução das cartas funcionam
igual ao racha, sem lógica paralela.

- Os dois times nascem junto com a partida (`POST /matches`): `plugshawty FC` e o adversário.
- `GET /matches/:id` devolve sempre o nosso time em `teams[0]` e o adversário em `teams[1]`.
- `POST /matches/:id/teams` numa partida rival **só troca os jogadores do nosso time** — nunca
  recria os times, senão apagaria o adversário e o placar já lançado.
- No frontend: `isRival`, `nossoTime`, `timesEscalados` e `abaDoCampo` em `MatchDetails.jsx`.
  Não há sorteio nem "trocar de time"; o campo tático mostra só o nosso time.

**Placar:** vale o digitado pelo admin; se ele não digitou, a soma dos gols lançados para os
atletas daquele time. A tela e o ranking (`/stats`) usam essa mesma regra.

---

## 📈 Evolução das Cartas pelo Desempenho

Os atributos gravados em `users` (pace, shooting...) são a **BASE**, vinda da planilha de
avaliação do elenco. **Nunca grave desempenho neles.** A evolução é calculada na leitura
por `calcularFormasDe()` + `aplicarForma()` (`backend/evolucao.js`, coberto por testes), e
aplicada em `/users`, `/users/:id`, `/stats` e `/matches/:id`.

Cada atleta chega com:
- `pace`, `shooting`... → já evoluídos (o `calcOVR` do frontend usa estes)
- `base_attrs` → os valores originais da planilha
- `form` → quanto cada atributo mudou, mais `partidas`, `nota` ponderada (null se nunca jogou),
  `nota_esperada`, `bonus_gol` e `bonus_assist` (pontos vindos de participação em gols acima
  do esperado — o `ResumoForma` usa para explicar a variação)

**Cada atuação é comparada com o esperado para o NÍVEL e a POSIÇÃO do atleta** — não com
uma régua única. Constantes em `EVOLUCAO`, calibradas com as partidas reais (set/2026):

- **Nota esperada cresce com o OVR base**: `6,2 + (OVR − 62) × 0,09`. O grupo já dá notas
  maiores a quem tem OVR maior (correlação 0,64), então nota 7 é ótima para um 60 e abaixo do
  esperado para um 81. Cada ponto de nota acima/abaixo do esperado move todos os atributos em 3.
- **Gols e assistências contam como parcela dos gols do time**, comparada com o esperado da
  posição (atacante 28% dos gols, zagueiro 3%...). Assim o placar do jogo não importa: 2 gols
  numa pelada de 15 é pouco. Só ficar acima soma; ficar abaixo **nunca penaliza**.
- O nível usado é sempre o **OVR base** da planilha — usar o evoluído realimentaria a fórmula.
- Todas as partidas contam; peso 1 para a mais recente, 0,85 para a anterior, 0,72...
- Confiança com poucos jogos: 1 jogo = 50%, 2 = 71%, 3 = 87%, 4+ = 100% (raiz quadrada).
- Acima de OVR 75 a subida fica mais lenta (um 85 sobe a 80% do ritmo, mínimo 60%).
- Cada atributo varia no máximo ±10. A nota só entra quando a votação fecha (prazo
  vencido ou finalizada pelo administrador).

A fórmula de OVR por posição vive só em `frontend/src/utils/ovr.js`; o backend carrega esse
mesmo arquivo via `import()`. **Não copie a fórmula para o backend**, e mantenha o ovr.js sem
imports, senão ele deixa de carregar no Node.

O perfil do atleta mostra `ResumoForma`, que explica a variação ("nota 6,7, abaixo do esperado
para OVR 81"). `form.nota_esperada` vem do backend para isso.

No frontend, `calcBaseOVR(player)` e `ovrTrend(player)` (em `utils/ovr.js`) dão o OVR da
planilha e a variação. O sorteio usa só `calcOVR` — somar a nota média de novo contaria o
desempenho duas vezes.

---

## 🔐 Permissões e Avaliação da Partida

**Administrador** vem da coluna `users.is_admin` (migrada uma vez a partir da regra
antiga por nome). Nunca voltar a deduzir admin comparando username/nickname.

Exclusivo do administrador, sempre:
- Criar, editar (data/hora/local), encerrar, reabrir e excluir partidas
- Placar dos times
- Número de gols e assistências de cada atleta

Livre para o grupo **até o encerramento**, depois só administrador:
- Sortear times, montar times à mão (`ManualTeamsModal`), trocar de time, adicionar,
  substituir e tirar jogador da partida

**Tirar jogador** (`DELETE /matches/:id/players/:userId`) apaga junto os gols, as
assistências e as notas dele naquela partida. Se ele já tem gol ou assistência
lançado, só o administrador pode tirá-lo (gols são exclusivos do admin).

**Fluxo de avaliação:**
1. O administrador clica em *Encerrar Partida*. Isso grava `matches.finished_at`.
2. A partir daí, **quem entrou em campo** (está em `team_players`) tem **12 horas**
   para dar nota a todos os jogadores da partida, inclusive a si mesmo.
   As notas vão de **0 a 10**, escolhidas numa barra deslizante. Zero é uma nota
   válida, então "ainda não avaliei" é a *ausência* da chave em `ratings`, nunca o zero.
3. Dentro do prazo dá para reenviar e corrigir: o `POST /ratings` apaga as notas
   anteriores daquele avaliador e grava as novas (índice único
   `ux_ratings_unicas` impede duplicata).
4. Passado o prazo ninguém mais avalia. `GET /matches/:id` devolve
   `rating_open`, `rating_ends_at`, `rating_hours` (duração total), `server_now` (para o
   contador não depender do relógio do celular), `raters` (quem já avaliou) e
   `my_ratings` (as notas de quem pediu).
5. O administrador pode **finalizar a votação antes** ou **mudar a duração**
   (`PUT /matches/:id/rating-window` com `{ action: 'close' }` ou `{ hours }`, de 1 a 168).
   O prazo fica em `matches.rating_deadline`; vazio, vale o padrão de 12h depois de
   `finished_at`. A duração conta do apito final, então aumentá-la depois do fim reabre
   a votação. Reabrir a partida zera `rating_deadline`. Toda conta de prazo passa por
   `fimDaAvaliacao()` no backend — inclusive a da evolução das cartas.

**Escala das notas:** de 0 a 10. As notas antigas (1 a 5) foram convertidas pelo dobro
numa migração de dados registrada em `schema_migrations`.

---

## 🔑 Login, Sessão e PIN

**Identidade = token assinado.** O login (`POST /login`, também `/register`) devolve o atleta
com `token` (HMAC-SHA256, 180 dias, `backend/auth.js`). O app manda
`Authorization: Bearer <token>` em toda chamada — use `authHeaders(user)` ou o helper
`api(path, { user })` de `frontend/src/utils/api.js`. **Nunca volte a confiar em id mandado
pelo cliente** (o antigo `x-user-id` deixava qualquer um virar admin pelo localStorage).

- Middlewares no `server.js`: `requireAuth`, `requireAdmin`, `requireSelfOrAdmin`,
  `requireOpenMatchOrAdmin`. `getRequester(req)` lê o token (ou devolve null).
- **Admin só vale com PIN:** `isAdminUser` exige `is_admin = 1` E PIN definido. Admin sem PIN
  é obrigado a criar um no login (`pinRequired`) e não pode pular nem remover o PIN.
- O token carrega a "versão do PIN": criar, trocar ou resetar o PIN derruba as sessões
  antigas daquele atleta. Por isso `POST /users/:id/pin` e `/reset-pin` devolvem `token`
  novo quando o alvo é o próprio usuário — o front precisa trocar o token salvo.
- PIN novo: exatamente 4 dígitos, guardado com scrypt (`hashPin`). 5 erros bloqueiam o PIN
  daquele atleta por 15 minutos (em memória). PINs antigos em texto puro foram convertidos
  pela migração `pins_com_hash`. A migração `perguntar_pin_de_novo` zerou `pin_prompted`
  de quem não tinha PIN, para o app oferecer criar um mais uma vez.
- O login casa **exatamente** nome de usuário, e-mail, celular (com ou sem DDI) ou um dos
  apelidos (`encontrarAtletas`). Se o termo serve para mais de um atleta, responde 409 e
  pede e-mail/celular — nunca escolhe o primeiro.
- Códigos de convite vêm de `INVITE_CODES`.
- Resposta 401 no front dispara o evento `sessao-expirada` e o `AuthContext` desloga.
  Sessões salvas sem `token` (de antes desta versão) são descartadas: o atleta entra de novo.

**Dados pessoais:** telefone e e-mail nunca aparecem em listagens (`/users`, `/stats`,
`/matches/:id`). `GET /users/:id` só os mostra ao próprio atleta e ao admin.
`PUT /users/:id/profile` só altera os campos enviados e ignora telefone/e-mail em branco.

---

## ⚡ Contrato de Fotos e Performance (LEIA ANTES DE MEXER NAS LISTAGENS)

As fotos dos atletas são guardadas no banco como data URI Base64 (até ~400KB cada).
Trazer esse conteúdo nas listagens colocava **~7MB na memória do servidor por request**,
o que estourava o limite de 512MB do plano gratuito do Render e deixava o app lento no celular.

**Regra:** nenhuma listagem pode selecionar as colunas `photo`/`original_photo` diretamente.

- O backend usa `photoCols(prefixo)` no SELECT, que traz apenas cabeçalho, tamanho e final
  da string, e `withPhotoUrls(row)` / `buildPhotoRef(...)` para montar a URL curta.
- As APIs devolvem `photo: "/users/:id/photo?v=<versão>"` em vez do Base64.
- `GET /users/:id/photo` serve a imagem binária com `Cache-Control: immutable` e ETag.
  A versão na URL vem do conteúdo, então trocar a foto invalida o cache sozinha. Sem `?v=`
  a resposta é `no-cache` (senão a foto antiga ficaria presa no navegador).
- Upload de foto fica só em memória (multer `memoryStorage`, até 4MB) e vira data URI no banco.
- No frontend, **sempre** renderize com `formatPhotoUrl(player.photo)` — nunca concatene
  `API_URL` na mão.
- Antes de exportar arte em PNG (`toPng`), chame `waitForImages(node)`
  (`frontend/src/utils/exportImage.js`): as fotos agora carregam por rede e sairiam em
  branco se a exportação não esperasse.

Resultado medido: `/users` 6.7MB → 5.7KB, `/stats` 6.7MB → 8.1KB, `/matches/:id` 6.2MB → 3.6KB.

**Servidor dormindo (Render grátis):** depois de ~15 min sem uso o servidor dorme e leva até
~50s para voltar. Chamadas à API devem passar por `api()` ou `fetchAcompanhado()`
(`utils/api.js`): passando de 4s, elas disparam o evento `servidor-lento` e o
`AvisoServidorLento` mostra a faixa "Acordando o servidor...". O primeiro carregamento da
página não tem como ser coberto, porque o próprio frontend é servido pelo servidor dormindo.

**Cabeçalho fixo:** o fundo do cartão fica no `.header::after` (opaco) e o `.header::before`
cobre a faixa entre o topo da tela e o cabeçalho com o mesmo fundo do body. Não volte a
deixar o `.header` translúcido: o conteúdo rolando por baixo aparecia através dele.

**Tela da partida:** o cartão de cada time da lista detalhada é `match/CartaoDoTime.jsx`;
os modais ficam em `match/*Modal.jsx`. O `MatchDetails.jsx` guarda estado e chamadas à API.

**Hooks do React:** todo `useState`/`useEffect`/`useRef` precisa ficar acima do
`if (!match) return <Carregando/>` em `MatchDetails.jsx`. Um hook declarado depois do
return antecipado quebra a tela com o erro React #310.

---

## 🚀 Como Executar o Projeto
Ver `README.md` (instalação, variáveis de ambiente, como promover o primeiro admin num banco
vazio e como rodar os testes). O GitHub Actions (`.github/workflows/ci.yml`) roda testes do
backend, lint e build do frontend a cada push.
