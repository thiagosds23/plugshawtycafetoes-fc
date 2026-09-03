const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
}, express.static(path.join(__dirname, 'uploads'), { dotfiles: 'ignore', index: false }));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer seguro para fotos de atletas
const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = allowedImageMimes.includes(file.mimetype) ? ext : '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${safeExt}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB para prevenir DoS
  fileFilter: (req, file, cb) => {
    if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens válidas (JPEG, PNG, WebP, GIF) são permitidas.'));
    }
  }
});

// Multer seguro para planilhas (.xlsx, .xls, .csv)
const allowedDocExts = ['.xlsx', '.xls', '.csv'];
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // Limite de 15MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedDocExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de planilha (.xlsx, .xls, .csv) são permitidos.'));
    }
  }
});

const INVITE_CODE = 'JOGO2026';

// -- AUTH --
app.post('/register', (req, res) => {
  const { username, email, phone, inviteCode } = req.body;
  const upperCode = (inviteCode || '').trim().toUpperCase();
  if (upperCode !== 'JOGO2026' && upperCode !== 'PELADA2026') {
    return res.status(400).json({ error: 'Código de convite inválido' });
  }
  if (!username || !username.trim() || !email || !email.trim() || !phone || !phone.trim()) {
    return res.status(400).json({ error: 'Preencha o Nome de Usuário, Celular e E-mail' });
  }

  const uName = username.trim();
  const uEmail = email.trim().toLowerCase();
  const uPhone = phone.trim();
  const rawDigitsPhone = uPhone.replace(/\D/g, '');

  // Check all users to prevent duplicate username, email, or phone
  db.all('SELECT id, username, email, phone FROM users', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco de dados' });

    for (const row of (rows || [])) {
      if (row.username && row.username.trim().toLowerCase() === uName.toLowerCase()) {
        return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
      }
      if (row.email && row.email.trim().toLowerCase() === uEmail) {
        return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
      }
      if (rawDigitsPhone.length >= 8 && row.phone) {
        const existingDigits = String(row.phone).replace(/\D/g, '');
        if (existingDigits === rawDigitsPhone || row.phone.trim() === uPhone) {
          return res.status(400).json({ error: 'Este telefone já está cadastrado.' });
        }
      }
    }

    db.run('INSERT INTO users (username, email, phone) VALUES (?, ?, ?)', [uName, uEmail, uPhone], function(err) {
      if (err) return res.status(400).json({ error: 'Erro ao cadastrar usuário' });
      res.json({ id: this.lastID, username: uName, email: uEmail, phone: uPhone });
    });
  });
});

app.post('/users', (req, res) => {
  const { username, nickname, position } = req.body;
  const name = (username || '').trim();
  const nick = (nickname || name).trim();
  const pos = position || 'MEI';

  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  // Check if athlete already exists by username or nickname
  db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR (nickname IS NOT NULL AND LOWER(nickname) = LOWER(?))', [name, nick], (err, existing) => {
    if (existing) {
      return res.json(existing);
    }
    db.run(
      'INSERT INTO users (username, nickname, position, pace, shooting, passing, dribbling, defending, physical) VALUES (?, ?, ?, 50, 50, 50, 50, 50, 50)',
      [name, nick, pos],
      function (err) {
        if (err) return res.status(400).json({ error: 'Erro ao cadastrar atleta: ' + err.message });
        res.json({ id: this.lastID, username: name, nickname: nick, position: pos, ovr: 50 });
      }
    );
  });
});

app.post('/login', (req, res) => {
  const { username, pin } = req.body; // Can be username, email, or phone number!
  if (!username) return res.status(400).json({ error: 'Informe seu usuário, e-mail ou telefone' });

  const queryTerm = username.trim();

  db.get(`
    SELECT * FROM users 
    WHERE LOWER(username) = LOWER(?) 
       OR LOWER(email) = LOWER(?) 
       OR phone = ? 
       OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', '') = REPLACE(REPLACE(REPLACE(?, ' ', ''), '-', ''), '(', '')
       OR (nickname IS NOT NULL AND INSTR(LOWER(nickname), LOWER(?)) > 0)
  `, [queryTerm, queryTerm, queryTerm, queryTerm, queryTerm], (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Usuário, e-mail, telefone ou apelido não encontrado' });

    // Se o usuário tem PIN cadastrado
    const userHasPin = !!(row.pin && String(row.pin).trim() !== '');

    if (userHasPin) {
      // Se não enviou o PIN na requisição, pede o PIN
      if (pin === undefined || pin === null || String(pin).trim() === '') {
        return res.json({ 
          requiresPin: true, 
          id: row.id, 
          username: row.username, 
          nickname: row.nickname,
          photo: row.photo 
        });
      }
      // Se enviou o PIN, valida
      if (String(row.pin).trim() !== String(pin).trim()) {
        return res.status(401).json({ error: 'PIN incorreto. Tente novamente ou peça ao administrador para resetar.' });
      }
    }

    const safeUser = { ...row };
    delete safeUser.pin;
    safeUser.has_pin = userHasPin;

    // Se o usuário NÃO tem PIN cadastrado e fez o login normal, pergunta se quer definir
    if (!userHasPin && (pin === undefined || pin === null)) {
      return res.json({
        askInitialPin: true,
        user: safeUser
      });
    }

    res.json(safeUser);
  });
});

// Definir ou Alterar PIN do próprio usuário
app.post('/users/:id/pin', (req, res) => {
  if (!verifyUserOwnership(req, res, req.params.id)) return;
  const { pin } = req.body; // string de dígitos ou null para remover
  const cleanPin = pin && String(pin).trim() ? String(pin).trim() : null;

  db.run('UPDATE users SET pin = ? WHERE id = ?', [cleanPin, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao salvar PIN' });
    res.json({ success: true, has_pin: !!cleanPin });
  });
});

// Resetar PIN de um usuário (Apenas Administrador / Thiago)
app.post('/users/:id/reset-pin', (req, res) => {
  const requesterId = req.headers['x-user-id'] || req.body?.requester_id;
  db.get('SELECT * FROM users WHERE id = ?', [requesterId], (err, adminUser) => {
    const isAdmin = adminUser && (adminUser.id === 1 || adminUser.username.toLowerCase().includes('thiago') || adminUser.username.toLowerCase().includes('fela'));
    if (!isAdmin && String(requesterId) !== String(req.params.id)) {
      return res.status(403).json({ error: 'Apenas administradores podem resetar o PIN de outros jogadores.' });
    }

    db.run('UPDATE users SET pin = NULL WHERE id = ?', [req.params.id], function(err2) {
      if (err2) return res.status(500).json({ error: 'Erro ao resetar PIN' });
      res.json({ success: true, message: 'PIN resetado com sucesso!' });
    });
  });
});

// -- USERS --
app.get('/users', (req, res) => {
  db.all('SELECT id, username, photo, original_photo, position, nickname, height, weight, pace, shooting, passing, dribbling, defending, physical, phone, email, (CASE WHEN pin IS NOT NULL AND pin != "" THEN 1 ELSE 0 END) as has_pin FROM users', [], (err, rows) => {
    res.json(rows);
  });
});

// Validação estrita de titularidade: cada usuário só pode alterar o seu próprio perfil/foto
function verifyUserOwnership(req, res, targetPlayerId) {
  const requesterId = req.headers['x-user-id'] || req.body?.requester_id;
  if (!requesterId || String(requesterId) !== String(targetPlayerId)) {
    res.status(403).json({ error: 'Acesso negado: Você só tem permissão para editar o seu próprio jogador.' });
    return false;
  }
  return true;
}

app.post('/users/:id/photo', upload.fields([{ name: 'photo' }, { name: 'original_photo' }]), (req, res) => {
  if (!verifyUserOwnership(req, res, req.params.id)) return;

  const photoFile = req.files && req.files['photo'] && req.files['photo'][0];
  const origFile = req.files && req.files['original_photo'] && req.files['original_photo'][0];

  if (!photoFile) return res.status(400).json({ error: 'Nenhuma foto enviada' });

  const photoUrl = '/uploads/' + photoFile.filename;
  if (origFile) {
    const origUrl = '/uploads/' + origFile.filename;
    db.run('UPDATE users SET photo = ?, original_photo = ? WHERE id = ?', [photoUrl, origUrl, req.params.id], (err) => {
      res.json({ photoUrl, origUrl });
    });
  } else {
    db.run('UPDATE users SET photo = ? WHERE id = ?', [photoUrl, req.params.id], (err) => {
      res.json({ photoUrl });
    });
  }
});

app.delete('/users/:id/photo', (req, res) => {
  if (!verifyUserOwnership(req, res, req.params.id)) return;

  db.run('UPDATE users SET photo = NULL, original_photo = NULL WHERE id = ?', [req.params.id], (err) => {
    res.json({ success: true });
  });
});

app.put('/users/:id/position', (req, res) => {
  if (!verifyUserOwnership(req, res, req.params.id)) return;

  const { position } = req.body;
  db.run('UPDATE users SET position = ? WHERE id = ?', [position, req.params.id], (err) => {
    res.json({ success: true });
  });
});

function formatHeight(val) {
  if (val === null || val === undefined || val === '') return '';
  let str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return val;
  if (num > 10) {
    return (num / 100).toFixed(2);
  }
  return num.toFixed(2);
}

app.put('/users/:id/profile', (req, res) => {
  if (!verifyUserOwnership(req, res, req.params.id)) return;

  const { username, nickname, position, height, weight, phone, email } = req.body;
  const formattedHeight = formatHeight(height);
  
  if (username && username.trim()) {
    db.run(`UPDATE users SET username = ?, nickname = ?, position = ?, height = ?, weight = ?,
            phone = ?, email = ?
            WHERE id = ?`, 
      [username.trim(), nickname, position, formattedHeight, weight, phone, email, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Erro ao atualizar perfil' });
        res.json({ success: true, height: formattedHeight });
    });
  } else {
    db.run(`UPDATE users SET nickname = ?, position = ?, height = ?, weight = ?,
            phone = ?, email = ?
            WHERE id = ?`, 
      [nickname, position, formattedHeight, weight, phone, email, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Erro ao atualizar perfil' });
        res.json({ success: true, height: formattedHeight });
    });
  }
});

// Import evaluations from Excel (.xlsx) spreadsheet
app.post('/users/import-ratings-excel', docUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo de planilha enviado' });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const normalize = str => (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    db.all('SELECT id, username, nickname FROM users', (err, users) => {
      if (err) return res.status(500).json({ error: err.message });

      let parsedStats = [];

      for (const sName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (!rows || rows.length < 2) continue;

        for (let rIdx = 0; rIdx < Math.min(rows.length, 10); rIdx++) {
          const row = rows[rIdx];
          if (!row || !Array.isArray(row)) continue;
          
          const rowStr = Array.from(row || [], c => (c ? normalize(c) : ''));
          
          const pacIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('pac') || c.includes('ritmo') || c.includes('velocidade')));
          const shoIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('sho') || c.includes('chute') || c.includes('finalizacao')));
          const pasIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('pas') || c.includes('passe')));
          const driIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('dri') || c.includes('drible') || c.includes('controle')));
          const defIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('def') || c.includes('defesa') || c.includes('marcacao')));
          const phyIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('phy') || c.includes('fisico') || c.includes('resistencia')));
          const nameIdx = rowStr.findIndex(c => typeof c === 'string' && (c.includes('nome') || c.includes('jogador') || c.includes('atleta')));

          if (pacIdx !== -1 && shoIdx !== -1 && nameIdx !== -1) {
            const playerMap = new Map();

            for (let i = rIdx + 1; i < rows.length; i++) {
              const dataRow = rows[i];
              if (!dataRow || !dataRow[nameIdx]) continue;
              
              const rawName = dataRow[nameIdx].toString().trim();
              const normName = normalize(rawName);
              if (normName.length < 2) continue;

              const toScore = val => {
                const num = parseFloat(String(val || '').replace(',', '.'));
                if (isNaN(num)) return null;
                const scaled = num <= 10 ? Math.round(num * 10) : Math.round(num);
                return Math.max(15, Math.min(99, scaled));
              };

              const pac = toScore(dataRow[pacIdx]);
              const sho = toScore(dataRow[shoIdx]);
              const pas = pasIdx !== -1 ? toScore(dataRow[pasIdx]) : null;
              const dri = driIdx !== -1 ? toScore(dataRow[driIdx]) : null;
              const def = defIdx !== -1 ? toScore(dataRow[defIdx]) : null;
              const phy = phyIdx !== -1 ? toScore(dataRow[phyIdx]) : null;

              if (pac !== null || sho !== null) {
                if (!playerMap.has(normName)) {
                  playerMap.set(normName, { rawName, normName, pac: [], sho: [], pas: [], dri: [], def: [], phy: [] });
                }
                const entry = playerMap.get(normName);
                if (pac !== null) entry.pac.push(pac);
                if (sho !== null) entry.sho.push(sho);
                if (pas !== null) entry.pas.push(pas);
                if (dri !== null) entry.dri.push(dri);
                if (def !== null) entry.def.push(def);
                if (phy !== null) entry.phy.push(phy);
              }
            }

            const calcAvg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

            for (const [normName, data] of playerMap.entries()) {
              parsedStats.push({
                rawName: data.rawName,
                normName,
                pac: calcAvg(data.pac),
                sho: calcAvg(data.sho),
                pas: calcAvg(data.pas),
                dri: calcAvg(data.dri),
                def: calcAvg(data.def),
                phy: calcAvg(data.phy)
              });
            }
            break;
          }
        }
        if (parsedStats.length > 0) break;
      }

      // Pattern 2: Google Forms Response Grid (e.g. "1. Thiago Silva (Fela) [PAC (Velocidade)]")
      if (parsedStats.length === 0) {
        for (const sName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          if (!rows || rows.length < 2) continue;

          const headerRow = Array.from(rows[0] || [], c => (c ? c.toString() : ''));
          if (headerRow.length === 0) continue;

          const colMap = [];
          headerRow.forEach((colTitle, cIdx) => {
            if (!colTitle) return;
            const str = colTitle.toString();
            const match = str.match(/^(?:\d+[\.\-\s]*)?([^\[\-]+)[\[\-]([^\]\)]+)/);
            if (match) {
              const playerName = match[1].replace(/\([^\)]*\)/g, '').trim();
              const statName = normalize(match[2]);
              let statType = null;
              if (statName.includes('pac') || statName.includes('ritmo') || statName.includes('velocidade')) statType = 'pac';
              else if (statName.includes('sho') || statName.includes('chute') || statName.includes('finalizacao')) statType = 'sho';
              else if (statName.includes('pas') || statName.includes('passe')) statType = 'pas';
              else if (statName.includes('dri') || statName.includes('drible') || statName.includes('controle')) statType = 'dri';
              else if (statName.includes('def') || statName.includes('defesa') || statName.includes('marcacao')) statType = 'def';
              else if (statName.includes('phy') || statName.includes('fisico') || statName.includes('resistencia')) statType = 'phy';

              if (statType && playerName.length >= 2) {
                colMap.push({ cIdx, normName: normalize(playerName), rawName: playerName, statType });
              }
            }
          });

          if (colMap.length >= 6) {
            const playerMap = new Map();
            for (let r = 1; r < rows.length; r++) {
              const row = rows[r];
              if (!row) continue;
              colMap.forEach(({ cIdx, normName, rawName, statType }) => {
                const val = row[cIdx];
                const num = parseFloat(String(val || '').replace(',', '.'));
                if (!isNaN(num)) {
                  const scaled = num <= 10 ? Math.round(num * 10) : Math.round(num);
                  const score = Math.max(15, Math.min(99, scaled));
                  if (!playerMap.has(normName)) {
                    playerMap.set(normName, { rawName, normName, pac: [], sho: [], pas: [], dri: [], def: [], phy: [] });
                  }
                  playerMap.get(normName)[statType].push(score);
                }
              });
            }

            const calcAvg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
            for (const [normName, data] of playerMap.entries()) {
              parsedStats.push({
                rawName: data.rawName,
                normName,
                pac: calcAvg(data.pac),
                sho: calcAvg(data.sho),
                pas: calcAvg(data.pas),
                dri: calcAvg(data.dri),
                def: calcAvg(data.def),
                phy: calcAvg(data.phy)
              });
            }
            break;
          }
        }
      }

      if (parsedStats.length === 0) {
        return res.status(400).json({ error: 'Não foi possível encontrar colunas de atributos de jogadores (PAC, SHO, PAS, DRI, DEF, PHY ou Velocidade, Finalização...) na planilha enviada.' });
      }

      const updated = [];
      db.serialize(() => {
        const stmt = db.prepare(`
          UPDATE users 
          SET pace = COALESCE(?, pace),
              shooting = COALESCE(?, shooting),
              passing = COALESCE(?, passing),
              dribbling = COALESCE(?, dribbling),
              defending = COALESCE(?, defending),
              physical = COALESCE(?, physical)
          WHERE id = ?
        `);

        for (const stat of parsedStats) {
          const matchedUser = users.find(u => {
            const uNorm = normalize(u.username);
            const nNorms = (u.nickname || '').split(',').map(n => normalize(n));
            return uNorm === stat.normName || nNorms.includes(stat.normName) ||
                   stat.normName.includes(uNorm) || uNorm.includes(stat.normName);
          });

          if (matchedUser) {
            stmt.run([stat.pac, stat.sho, stat.pas, stat.dri, stat.def, stat.phy, matchedUser.id]);
            updated.push({ id: matchedUser.id, name: matchedUser.username, stat });
          }
        }

        stmt.finalize(() => {
          try { fs.unlinkSync(req.file.path); } catch (e) {}
          res.json({ success: true, updatedCount: updated.length, updatedPlayers: updated });
        });
      });
    });
  } catch (err) {
    console.error('Erro ao processar planilha Excel:', err);
    res.status(500).json({ error: 'Erro ao processar arquivo: ' + err.message });
  }
});

app.delete('/users/:id', (req, res) => {
  const id = req.params.id;
  db.serialize(() => {
    db.run('DELETE FROM team_players WHERE user_id = ?', [id]);
    db.run('DELETE FROM goals WHERE user_id = ?', [id]);
    db.run('DELETE FROM assists WHERE user_id = ?', [id]);
    db.run('DELETE FROM ratings WHERE rater_id = ? OR rated_id = ?', [id, id]);
    db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
      res.json({ success: true });
    });
  });
});

// -- MATCHES --
app.post('/matches', (req, res) => {
  const { date } = req.body;
  db.run('INSERT INTO matches (date) VALUES (?)', [date], function(err) {
    res.json({ id: this.lastID, date, status: 'scheduled' });
  });
});

app.put('/matches/:id', (req, res) => {
  const { status, date } = req.body;
  if (status && date) {
    db.run('UPDATE matches SET status = ?, date = ? WHERE id = ?', [status, date, req.params.id], function(err) {
      res.json({ success: true });
    });
  } else if (status) {
    db.run('UPDATE matches SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
      res.json({ success: true });
    });
  } else if (date) {
    db.run('UPDATE matches SET date = ? WHERE id = ?', [date, req.params.id], function(err) {
      res.json({ success: true });
    });
  } else {
    res.json({ success: false });
  }
});

app.get('/matches', (req, res) => {
  db.all('SELECT * FROM matches ORDER BY date DESC, id DESC', [], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/matches/:id', (req, res) => {
  const matchId = req.params.id;
  db.get('SELECT * FROM matches WHERE id = ?', [matchId], (err, match) => {
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
    
    db.all(`
      SELECT t.id as team_id, t.name as team_name, t.manual_score, u.id as user_id, u.username, u.nickname, u.photo, u.original_photo, u.position,
             u.pace, u.shooting, u.passing, u.dribbling, u.defending, u.physical
      FROM teams t
      LEFT JOIN team_players tp ON t.id = tp.team_id
      LEFT JOIN users u ON tp.user_id = u.id
      WHERE t.match_id = ?
    `, [matchId], (err, teamRows) => {
      
      const teams = {};
      (teamRows || []).forEach(row => {
        if (!teams[row.team_id]) {
          teams[row.team_id] = { id: row.team_id, name: row.team_name, manual_score: row.manual_score, players: [] };
        }
        if (row.user_id) {
          teams[row.team_id].players.push({
            id: row.user_id,
            username: row.username,
            nickname: row.nickname,
            photo: row.photo,
            original_photo: row.original_photo,
            position: row.position,
            pace: row.pace,
            shooting: row.shooting,
            passing: row.passing,
            dribbling: row.dribbling,
            defending: row.defending,
            physical: row.physical
          });
        }
      });

      db.all(`
        SELECT g.id, g.user_id, u.username, u.nickname, tp.team_id
        FROM goals g
        JOIN users u ON g.user_id = u.id
        LEFT JOIN team_players tp ON (tp.user_id = u.id AND tp.team_id IN (SELECT id FROM teams WHERE match_id = ?))
        WHERE g.match_id = ?
        ORDER BY g.id ASC
      `, [matchId, matchId], (err, goalRows) => {

        db.all(`
          SELECT a.id, a.user_id, u.username, u.nickname, tp.team_id
          FROM assists a
          JOIN users u ON a.user_id = u.id
          LEFT JOIN team_players tp ON (tp.user_id = u.id AND tp.team_id IN (SELECT id FROM teams WHERE match_id = ?))
          WHERE a.match_id = ?
          ORDER BY a.id ASC
        `, [matchId, matchId], (err, assistRows) => {

          db.all(`
            SELECT r.rated_id, r.score, u.username, u.nickname
            FROM ratings r
            JOIN users u ON r.rated_id = u.id
            WHERE r.match_id = ?
          `, [matchId], (err, ratingRows) => {

            match.teams = Object.values(teams);
            match.goals = goalRows || [];
            match.assists = assistRows || [];
            match.ratings = ratingRows || [];

            match.teams.forEach(t => {
              if (t.manual_score !== null && t.manual_score !== undefined) {
                t.score = t.manual_score;
              } else {
                t.score = (match.goals || []).filter(g => g.team_id === t.id).length;
              }
            });

            res.json(match);
          });
        });
      });
    });
  });
});

app.post('/matches/:id/teams', (req, res) => {
  const matchId = req.params.id;
  const { teams } = req.body;
  
  db.serialize(() => {
    // 1. Delete existing team_players for this match
    db.run('DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE match_id = ?)', [matchId]);
    // 2. Delete existing teams for this match
    db.run('DELETE FROM teams WHERE match_id = ?', [matchId]);

    if (!teams || teams.length === 0) {
      return res.json({ success: true });
    }

    let completedTeams = 0;
    teams.forEach(team => {
      db.run('INSERT INTO teams (match_id, name) VALUES (?, ?)', [matchId, team.name], function(err) {
        if (err) console.error('Error creating team:', err);
        const teamId = this.lastID;
        const playerIds = team.playerIds || [];

        if (playerIds.length === 0) {
          completedTeams++;
          if (completedTeams === teams.length) res.json({ success: true });
          return;
        }

        let insertedPlayers = 0;
        playerIds.forEach(playerId => {
          db.run('INSERT INTO team_players (team_id, user_id) VALUES (?, ?)', [teamId, playerId], () => {
            insertedPlayers++;
            if (insertedPlayers === playerIds.length) {
              completedTeams++;
              if (completedTeams === teams.length) {
                res.json({ success: true });
              }
            }
          });
        });
      });
    });
  });
});

// Update team manual score
app.put('/matches/:id/team-score', (req, res) => {
  const { team_id, score } = req.body;
  const numScore = parseInt(score, 10);
  db.run('UPDATE teams SET manual_score = ? WHERE id = ?', [isNaN(numScore) ? null : numScore, team_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, score: numScore });
  });
});

// Update player goals or assists count directly
app.put('/matches/:id/player-events', (req, res) => {
  const matchId = req.params.id;
  const { user_id, type, count } = req.body;
  const table = type === 'goal' ? 'goals' : 'assists';
  const targetCount = Math.max(0, parseInt(count, 10) || 0);

  db.run(`DELETE FROM ${table} WHERE match_id = ? AND user_id = ?`, [matchId, user_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    if (targetCount === 0) return res.json({ success: true, count: 0 });

    let inserted = 0;
    for (let i = 0; i < targetCount; i++) {
      db.run(`INSERT INTO ${table} (match_id, user_id) VALUES (?, ?)`, [matchId, user_id], () => {
        inserted++;
        if (inserted === targetCount) {
          res.json({ success: true, count: targetCount });
        }
      });
    }
  });
});

// -- EVENTS (Goals, Assists) --
app.post('/events', (req, res) => {
  const { type, match_id, user_id } = req.body;
  if (type === 'goal') {
    db.run('INSERT INTO goals (match_id, user_id) VALUES (?, ?)', [match_id, user_id], function() {
      res.json({ success: true, id: this.lastID });
    });
  } else if (type === 'assist') {
    db.run('INSERT INTO assists (match_id, user_id) VALUES (?, ?)', [match_id, user_id], function() {
      res.json({ success: true, id: this.lastID });
    });
  } else {
    res.status(400).json({ error: 'Tipo inválido' });
  }
});

// -- RATINGS --
app.post('/ratings', (req, res) => {
  const { match_id, rater_id, rated_id, score } = req.body;
  db.run('INSERT INTO ratings (match_id, rater_id, rated_id, score) VALUES (?, ?, ?, ?)', 
    [match_id, rater_id, rated_id, score], function(err) {
      res.json({ success: true });
  });
});

// Delete individual goal or assist
app.delete('/goals/:id', (req, res) => {
  db.run('DELETE FROM goals WHERE id = ?', [req.params.id], (err) => {
    res.json({ success: true });
  });
});

app.delete('/assists/:id', (req, res) => {
  db.run('DELETE FROM assists WHERE id = ?', [req.params.id], (err) => {
    res.json({ success: true });
  });
});

// Delete match and all related records
app.delete('/matches/:id', (req, res) => {
  const matchId = req.params.id;
  db.serialize(() => {
    db.run('DELETE FROM ratings WHERE match_id = ?', [matchId]);
    db.run('DELETE FROM goals WHERE match_id = ?', [matchId]);
    db.run('DELETE FROM assists WHERE match_id = ?', [matchId]);
    db.run('DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE match_id = ?)', [matchId]);
    db.run('DELETE FROM teams WHERE match_id = ?', [matchId]);
    db.run('DELETE FROM matches WHERE id = ?', [matchId], (err) => {
      res.json({ success: true });
    });
  });
});

// Switch player between teams (Time A <-> Time B)
app.put('/matches/:id/switch-team', (req, res) => {
  const matchId = req.params.id;
  const { user_id } = req.body;
  db.all('SELECT id FROM teams WHERE match_id = ?', [matchId], (err, teams) => {
    if (!teams || teams.length < 2) return res.status(400).json({ error: 'Menos de 2 times' });
    const teamA = teams[0].id;
    const teamB = teams[1].id;
    db.get('SELECT team_id FROM team_players WHERE user_id = ? AND (team_id = ? OR team_id = ?)', 
      [user_id, teamA, teamB], (err, tp) => {
        if (!tp) return res.status(404).json({ error: 'Jogador não encontrado na partida' });
        const newTeamId = tp.team_id === teamA ? teamB : teamA;
        db.run('UPDATE team_players SET team_id = ? WHERE user_id = ? AND team_id = ?', 
          [newTeamId, user_id, tp.team_id], (err) => {
            res.json({ success: true, newTeamId });
        });
    });
  });
});

// Replace a player in a team with another player from the roster
app.put('/matches/:id/replace-player', (req, res) => {
  const matchId = req.params.id;
  const { old_user_id, new_user_id } = req.body;
  db.all('SELECT id FROM teams WHERE match_id = ?', [matchId], (err, teams) => {
    if (!teams || teams.length === 0) return res.status(400).json({ error: 'Sem times na partida' });
    const teamIds = teams.map(t => t.id);
    const placeholders = teamIds.map(() => '?').join(',');
    db.run(`UPDATE team_players SET user_id = ? WHERE user_id = ? AND team_id IN (${placeholders})`, 
      [new_user_id, old_user_id, ...teamIds], (err) => {
        res.json({ success: true });
    });
  });
});

// -- LEADERBOARD & STATS --
app.get('/stats', (req, res) => {
  const { month, year } = req.query;

  db.all('SELECT * FROM users', [], (err, users) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all('SELECT * FROM matches WHERE status = "completed"', [], (err, completedMatches) => {
      db.all('SELECT * FROM teams', [], (err, allTeams) => {
        db.all('SELECT * FROM team_players', [], (err, allTeamPlayers) => {
          db.all('SELECT * FROM goals', [], (err, allGoals) => {
            db.all('SELECT * FROM assists', [], (err, allAssists) => {
              db.all('SELECT * FROM ratings', [], (err, allRatings) => {

                const matchesList = completedMatches || [];

                const result = (users || []).map(user => {
                  let userGoals = 0;
                  let userAssists = 0;
                  let userRatings = [];
                  let wins = 0;
                  let draws = 0;
                  let losses = 0;
                  let matchesCount = 0;

                  const targetMatches = matchesList.filter(m => {
                    if (year && month) return m.date && m.date.startsWith(`${year}-${month.padStart(2, '0')}`);
                    if (year) return m.date && m.date.startsWith(`${year}-`);
                    return true;
                  });

                  // Sort matches descending by date to track recent form (newest first)
                  targetMatches.sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00') || b.id - a.id);

                  const userMatchesList = [];

                  targetMatches.forEach(m => {
                    const matchTeams = (allTeams || []).filter(t => t.match_id === m.id);
                    const userTeam = matchTeams.find(t => {
                      return (allTeamPlayers || []).some(tp => tp.team_id === t.id && tp.user_id === user.id);
                    });

                    if (userTeam) {
                      matchesCount++;

                      const teamAGoals = (allGoals || []).filter(g => {
                        return g.match_id === m.id && (allTeamPlayers || []).some(tp => tp.team_id === matchTeams[0]?.id && tp.user_id === g.user_id);
                      }).length;

                      const teamBGoals = (allGoals || []).filter(g => {
                        return g.match_id === m.id && matchTeams[1] && (allTeamPlayers || []).some(tp => tp.team_id === matchTeams[1]?.id && tp.user_id === g.user_id);
                      }).length;

                      if (matchTeams.length >= 2) {
                        const teamAScore = (matchTeams[0].manual_score !== null && matchTeams[0].manual_score !== undefined) 
                          ? matchTeams[0].manual_score 
                          : teamAGoals;
                        const teamBScore = (matchTeams[1].manual_score !== null && matchTeams[1].manual_score !== undefined) 
                          ? matchTeams[1].manual_score 
                          : teamBGoals;

                        const isTeamA = userTeam.id === matchTeams[0].id;
                        const myGoals = isTeamA ? teamAScore : teamBScore;
                        const oppGoals = isTeamA ? teamBScore : teamAScore;

                        let matchRes = 'E';
                        if (myGoals > oppGoals) { wins++; matchRes = 'V'; }
                        else if (myGoals === oppGoals) { draws++; matchRes = 'E'; }
                        else { losses++; matchRes = 'D'; }

                        userMatchesList.push(matchRes);
                      }
                    }
                  });

                  let winStreak = 0;
                  for (const r of userMatchesList) {
                    if (r === 'V') winStreak++;
                    else break;
                  }

                  (allGoals || []).forEach(g => {
                    if (g.user_id === user.id) {
                      const match = matchesList.find(m => m.id === g.match_id);
                      if (match) {
                        if (year && month && !match.date.startsWith(`${year}-${month.padStart(2, '0')}`)) return;
                        if (year && !month && !match.date.startsWith(`${year}-`)) return;
                        userGoals++;
                      }
                    }
                  });

                  (allAssists || []).forEach(a => {
                    if (a.user_id === user.id) {
                      const match = matchesList.find(m => m.id === a.match_id);
                      if (match) {
                        if (year && month && !match.date.startsWith(`${year}-${month.padStart(2, '0')}`)) return;
                        if (year && !month && !match.date.startsWith(`${year}-`)) return;
                        userAssists++;
                      }
                    }
                  });

                  (allRatings || []).forEach(r => {
                    if (r.rated_id === user.id) {
                      const match = matchesList.find(m => m.id === r.match_id);
                      if (match) {
                        if (year && month && !match.date.startsWith(`${year}-${month.padStart(2, '0')}`)) return;
                        if (year && !month && !match.date.startsWith(`${year}-`)) return;
                        userRatings.push(r.score);
                      }
                    }
                  });

                  const avgRating = userRatings.length > 0
                    ? (userRatings.reduce((a, b) => a + b, 0) / userRatings.length)
                    : 0;

                  const winRate = matchesCount > 0 ? Math.round((wins / matchesCount) * 100) : 0;

                  return {
                    ...user,
                    goals: userGoals,
                    assists: userAssists,
                    avg_rating: avgRating,
                    matches_count: matchesCount,
                    wins,
                    draws,
                    losses,
                    win_rate: winRate,
                    recent_form: userMatchesList.slice(0, 5),
                    win_streak: winStreak
                  };
                });

                res.json(result);
              });
            });
          });
        });
      });
    });
  });
});

// Middleware global de tratamento de erros de upload e requisição
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'O arquivo enviado excede o limite máximo permitido (10MB para fotos, 15MB para planilhas).' });
    }
    return res.status(400).json({ error: `Erro no upload: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message || 'Erro inesperado na requisição.' });
  }
  next();
});

// Servir frontend compilado estaticamente quando disponível (Modo Fullstack Unificado na Nuvem)
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/uploads') && !req.path.startsWith('/users') && !req.path.startsWith('/matches') && !req.path.startsWith('/stats') && !req.path.startsWith('/ratings') && !req.path.startsWith('/login') && !req.path.startsWith('/register')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n⚠️  PORTA ${PORT} JÁ EM USO!`);
    console.log(`O backend já está rodando em segundo plano no seu computador e atendendo normalmente.`);
    console.log(`Se quiser reiniciar manualmente, digite no terminal:\n  npx kill-port ${PORT}\n  node server.js\n`);
    process.exit(1);
  } else {
    console.error('Erro no servidor backend:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Erro não capturado (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Rejeição não tratada (unhandledRejection):', reason);
});
