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
