# plugshawtycafetoes FC

App do clube para organizar as peladas: convocação, sorteio dos times por OVR, placar,
avaliação pós-jogo e cartas estilo FUT que evoluem com o desempenho.

- **Frontend:** React 19 + Vite (`frontend/`)
- **Backend:** Node.js + Express 5 (`backend/`), banco Turso (libSQL)
- **Hospedagem:** Render, servindo API e frontend compilado no mesmo serviço

As regras de negócio (evolução das cartas, prazo de avaliação, permissões, contrato das
fotos) estão em [`MEMORY.md`](MEMORY.md). Leia antes de mexer.

## Rodando localmente

Precisa do Node 22.

```bash
npm run install-all

# Backend (porta 3001). Sem backend/.env usa o arquivo local backend/database.sqlite,
# que é criado vazio na primeira vez.
npm run dev:backend

# Frontend (porta 5173), em outro terminal
npm run dev:frontend
```

Num banco vazio não existe administrador. Cadastre-se pelo app e promova sua conta:

```sql
UPDATE users SET is_admin = 1 WHERE username = 'seu nome';
```

No próximo login o app pede para criar o PIN (obrigatório para administrador).

## Variáveis de ambiente

Veja [`backend/.env.example`](backend/.env.example). No Render, cadastre em
**Dashboard > Environment**:

| Variável | Para quê |
| --- | --- |
| `TURSO_DATABASE_URL` | Endereço do banco Turso (obrigatória no Render) |
| `TURSO_AUTH_TOKEN` | Token do banco (obrigatória no Render) |
| `AUTH_SECRET` | Assina os tokens de login. Se faltar, é derivado do token do Turso |
| `INVITE_CODES` | Códigos de convite do cadastro, separados por vírgula |

Nunca escreva credenciais no código: o repositório é público.

## Testes

```bash
npm test                      # backend (node:test) + telas do frontend (vitest + jsdom)
cd frontend && npm run lint   # oxlint
```

O GitHub Actions roda os testes, o lint e o build a cada push.
