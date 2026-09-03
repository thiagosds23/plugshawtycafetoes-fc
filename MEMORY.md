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

## 🚀 Como Executar o Projeto
1. **Backend:** No diretório `backend/`, execute `node server.js` (Porta 3001).
2. **Frontend:** No diretório `frontend/`, execute `npm run dev` (Porta 5173).
