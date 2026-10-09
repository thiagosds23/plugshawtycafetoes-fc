const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AUTH_SECRET = 'segredo-de-teste';
const auth = require('../auth');

test('token assinado vale e devolve o atleta', () => {
  const token = auth.criarToken({ id: 7, pin: null });
  const dados = auth.lerToken(token);
  assert.equal(dados.uid, 7);
  assert.equal(dados.pv, auth.versaoDoPin(null));
});

test('token com assinatura ou conteúdo adulterado é recusado', () => {
  const token = auth.criarToken({ id: 7, pin: null });
  const [corpo, assinatura] = token.split('.');
  // Trocar o id dentro do token sem conseguir assinar de novo
  const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpo, 'base64url')), uid: 1 })).toString('base64url');
  assert.equal(auth.lerToken(`${outro}.${assinatura}`), null);
  assert.equal(auth.lerToken(`${corpo}.${assinatura.slice(0, -2)}xx`), null);
  assert.equal(auth.lerToken('lixo'), null);
  assert.equal(auth.lerToken(undefined), null);
});

test('token vencido é recusado', () => {
  const emitidoHaUmAno = Date.now() - 365 * 24 * 3600 * 1000;
  assert.equal(auth.lerToken(auth.criarToken({ id: 1, pin: null }, emitidoHaUmAno)), null);
});

test('trocar o PIN muda a versão gravada no token', () => {
  assert.notEqual(auth.versaoDoPin(null), auth.versaoDoPin(auth.hashPin('1234')));
  assert.equal(auth.versaoDoPin(null), auth.versaoDoPin(''));
});

test('PIN com hash confere só o número certo', () => {
  const guardado = auth.hashPin('4321');
  assert.ok(guardado.startsWith('scrypt$'));
  assert.ok(!guardado.includes('4321'));
  assert.equal(auth.conferePin('4321', guardado), true);
  assert.equal(auth.conferePin('1234', guardado), false);
  assert.equal(auth.conferePin('', guardado), false);
});

test('PIN antigo em texto puro ainda confere', () => {
  assert.equal(auth.conferePin('1234', '1234'), true);
  assert.equal(auth.conferePin(' 1234 ', '1234'), true);
  assert.equal(auth.conferePin('12345', '1234'), false);
});

test('PIN novo precisa de exatamente 4 dígitos', () => {
  assert.equal(auth.pinValido('1234'), true);
  ['123', '12345', 'abcd', '', null, undefined].forEach(p => assert.equal(auth.pinValido(p), false));
});

test('5 erros de PIN bloqueiam o atleta por 15 minutos', () => {
  const agora = Date.now();
  for (let i = 0; i < 4; i++) assert.equal(auth.registrarErroDePin(99, agora), false);
  assert.equal(auth.pinBloqueado(99, agora), false);
  assert.equal(auth.registrarErroDePin(99, agora), true);
  assert.equal(auth.pinBloqueado(99, agora + 60 * 1000), true);
  assert.equal(auth.pinBloqueado(99, agora + 16 * 60 * 1000), false);
  auth.limparErrosDePin(99);
});

const ELENCO = [
  { id: 1, username: 'Thiago Silva', nickname: 'Fela, Felão', email: 'thiago@x.com', phone: '54999998888' },
  { id: 2, username: 'Guilherme', nickname: 'Gui', email: 'gui@x.com', phone: '(54) 98888-7777' },
  { id: 3, username: 'Guizão', nickname: 'Guizão', email: null, phone: null },
  { id: 4, username: 'Pedro', nickname: 'Pedrinho', email: null, phone: null }
];
const ids = (termo) => auth.encontrarAtletas(termo, ELENCO).map(a => a.id);

test('login acha o atleta por nome, apelido, e-mail ou celular exatos', () => {
  assert.deepEqual(ids('thiago silva'), [1]);
  assert.deepEqual(ids('FELÃO'), [1]);
  assert.deepEqual(ids('felao'), [1]);
  assert.deepEqual(ids('gui@x.com'), [2]);
  assert.deepEqual(ids('54 99999-8888'), [1]);
  assert.deepEqual(ids('+55 54 99999-8888'), [1]);
  assert.deepEqual(ids('54988887777'), [2]);
});

test('login não casa pedaço de nome (antes "gui" podia entrar como Guizão)', () => {
  assert.deepEqual(ids('gui'), [2]);
  assert.deepEqual(ids('guiza'), []);
  assert.deepEqual(ids('pedr'), []);
  assert.deepEqual(ids('a'), []);
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('9999'), []);
});

test('nome que serve para dois atletas aparece duas vezes (o login pede e-mail)', () => {
  const comRepetido = [...ELENCO, { id: 5, username: 'Fela', nickname: null }];
  assert.deepEqual(auth.encontrarAtletas('fela', comRepetido).map(a => a.id), [1, 5]);
});
