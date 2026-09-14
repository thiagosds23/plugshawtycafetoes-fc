# Memória do Projeto: plugshawtycafetoes FC

Este arquivo serve como um histórico de tudo que foi planejado e desenvolvido até agora, para que você possa continuar o desenvolvimento em um novo chat sem perder o contexto do que já fizemos.

## 🛠️ Stack Tecnológica
- **Frontend:** React + Vite, Framer Motion, Lucide Icons, html-to-image, CSS puro estruturado.
- **Backend:** Node.js, Express, SQLite (banco de dados local `database.sqlite`).

---

## ⚽ Funcionalidades Implementadas

### 1. Sistema de Jogadores e Cartas estilo FIFA (FUT)
- **Atributos (0-99):** Pace (PAC), Shooting (SHO), Passing (PAS), Dribbling (DRI), Defending (DEF) e Physical (PHY).
- **Overall (OVR):** Calculado automaticamente a partir da média dos 6 atributos.
- **Design das Cartas:** Fundo real (`fut-bg.png` em `frontend/public/`) com enquadramento percentual em `fut-card.css`.
- **Edição & Exclusão Limpa:** Formato de card em vidro com upload de foto e exclusão com limpeza de estado em cascata.

### 2. Sorteio Inteligente de Equipes por OVR (Snake Draft Ponderado)
- **Cálculo da Força Efetiva:** \( OVR_{efetivo} = \text{OVR Base} + (\text{Nota Média} \times 2) \).
- **Snake Draft:** Distribuição balanceada dos convocados entre as equipes para minimizar a diferença de OVR.
- **Indicador em Tempo Real:** Exibe o OVR médio de cada equipe e placar da partida.

### 3. 📸 Gerador de Arte da Escalação para WhatsApp (Killer Feature)
- Botão **"📸 Exportar para WhatsApp"** na tela da partida (`MatchDetails.jsx`).
- Converte o card visual da escalação (Time Jamaica em amarelo vs Time Roots em verde, com fotos de perfil e OVR dos convocados) em imagem PNG de alta definição para compartilhamento direto nos grupos.

### 4. Agenda & Histórico Agrupado por Mês (`Matches.jsx`)
- Agrupamento mensal automático (ex: *Setembro 2026*, *Agosto 2026*).
- Status visuais nítidos: `🟡 Convocação Aberta / A definir times` vs `🟢 Partida Encerrada`.

### 5. Hall da Fama & Ranking do Mês vs Temporada (`Dashboard.jsx`)
- **Filtro de Período:** Alternador entre `Mês Atual` (Craque do Mês) e `Temporada Completa` (MVP Geral).
- **Resumo de Carreira V/E/D:** Exibe Vitórias, Empates, Derrotas e % de Aproveitamento de cada jogador.
- **Meta do Mês:** Barra de progresso para presença mensal nas peladas (Meta: 4 partidas/mês).
- **Conquistas Automatizadas (Badges):** Medalhas de *Artilheiro*, *Garçom*, *Craque do Mês/MVP*, *Padrão Defesa* e *Pé Murcho*.

---

## 💡 Skills Instaladas no Projeto & Antigravity
- **Locais (`.agents/skills/`):**
  - `fut-card-engine`: Regras de OVR e enquadramento das cartas.
  - `team-balancer-rules`: Algoritmo Snake Draft por OVR.
  - `pelada-achievements`: Lógica de distribuição de medalhas.
- **Globais:** `find-skills`, `frontend-design`, `webapp-testing`, `sqlite-database-expert`, `vercel-react-best-practices`, `react-doctor`, `improve-codebase-architecture`, `grill-me`, `grill-with-docs`, `tdd`, `setup-matt-pocock-skills`, `react-email`, `stitch::react-components`.

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
avaliação do elenco. **Nunca grave desempenho neles.** A evolução é calculada a cada leitura
por `calcularFormas()` + `aplicarForma()` no backend, e aplicada em `/users`, `/users/:id`,
`/stats` e `/matches/:id`.

Cada atleta chega com:
- `pace`, `shooting`... → já evoluídos (o `calcOVR` do frontend usa estes)
- `base_attrs` → os valores originais da planilha
- `form` → quanto cada atributo mudou, mais `partidas` e `nota` ponderada (null se nunca jogou)

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
- Cada atributo varia no máximo ±10. A nota só entra quando o prazo de 12h fecha.

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
- Sortear times, trocar de time, adicionar e substituir jogador

**Fluxo de avaliação:**
1. O administrador clica em *Encerrar Partida*. Isso grava `matches.finished_at`.
2. A partir daí, **quem entrou em campo** (está em `team_players`) tem **12 horas**
   para dar nota a todos os jogadores da partida, inclusive a si mesmo.
   As notas vão de **0 a 10**, escolhidas numa barra deslizante. Zero é uma nota
   válida, então "ainda não avaliei" é a *ausência* da chave em `ratings`, nunca o zero.
3. Dentro do prazo dá para reenviar e corrigir: o `POST /ratings` apaga as notas
   anteriores daquele avaliador e grava as novas (índice único
   `ux_ratings_unicas` impede duplicata).
4. Passadas as 12 horas ninguém mais avalia. `GET /matches/:id` devolve
   `rating_open`, `rating_ends_at`, `server_now` (para o contador não depender do
   relógio do celular), `raters` (quem já avaliou) e `my_ratings` (as notas de quem pediu).

A autorização usa o cabeçalho `x-user-id` (mesmo mecanismo do backup e da auditoria).
Isso protege o uso normal, mas **não é autenticação de verdade** — quem souber forjar
a requisição consegue se passar por admin. Corrigir isso exige sessão/token assinado.

**Escala das notas:** de 0 a 10. As notas antigas (1 a 5) foram convertidas pelo dobro
numa migração de dados registrada em `schema_migrations` — migração de DADOS nunca pode
rodar a cada boot, use `aplicarUmaVez(nome, fn)`. A Força Efetiva do sorteio é
`OVR + nota_média` (antes era `OVR + nota × 2`, porque a nota ia só até 5).

**Armadilha do driver:** `db.serialize()` no wrapper do Turso NÃO serializa nada —
ele só executa a função. Comandos que dependem de ordem (apagar filhos antes do pai,
limpar antes de inserir) precisam de `await dbRun(...)` em sequência. Ignorar isso
fazia o `DELETE` de partida falhar por FOREIGN KEY enquanto a API respondia sucesso.

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
  A versão na URL vem do conteúdo, então trocar a foto invalida o cache sozinha.
- No frontend, **sempre** renderize com `formatPhotoUrl(player.photo)` — nunca concatene
  `API_URL` na mão.
- Antes de exportar arte em PNG (`toPng`), chame `waitForImages(node)`
  (`frontend/src/utils/exportImage.js`): as fotos agora carregam por rede e sairiam em
  branco se a exportação não esperasse.

Resultado medido: `/users` 6.7MB → 5.7KB, `/stats` 6.7MB → 8.1KB, `/matches/:id` 6.2MB → 3.6KB.

**Hooks do React:** todo `useState`/`useEffect`/`useRef` precisa ficar acima do
`if (!match) return <Carregando/>` em `MatchDetails.jsx`. Um hook declarado depois do
return antecipado quebra a tela com o erro React #310.

---

## 🚀 Como Executar o Projeto
1. **Backend:** No diretório `backend/`, execute `node server.js` (Porta 3001).
2. **Frontend:** No diretório `frontend/`, execute `npm run dev` (Porta 5173).
