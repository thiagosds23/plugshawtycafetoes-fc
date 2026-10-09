// Efeitos sonoros sintetizados com a Web Audio API (sem arquivos de áudio, latência zero)

// Um único AudioContext para o app inteiro. Criar um por nota, sem nunca fechar,
// estoura o limite de contextos do navegador e o iPhone passa a ficar mudo.
let contextoDeAudio = null;

function obterContexto() {
  const Contexto = window.AudioContext || window.webkitAudioContext;
  if (!Contexto) return null;
  if (!contextoDeAudio || contextoDeAudio.state === 'closed') {
    contextoDeAudio = new Contexto();
  }
  // O navegador suspende o contexto até haver um toque do usuário (e de novo quando
  // a aba vai para segundo plano): sem o resume() os bipes saem em silêncio
  if (contextoDeAudio.state === 'suspended') {
    contextoDeAudio.resume().catch(() => {});
  }
  return contextoDeAudio;
}

function tocarNota(ctx, frequencia, inicio) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequencia, inicio);
  gain.gain.setValueAtTime(0.12, inicio);
  gain.gain.exponentialRampToValueAtTime(0.001, inicio + 0.1);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(inicio);
  osc.stop(inicio + 0.1);
}

/**
 * Libera o áudio. Chame dentro do clique do usuário: o iPhone só deixa o contexto
 * tocar se ele foi criado ou retomado num toque, e os sons do sorteio tocam depois.
 */
export function prepararAudio() {
  try {
    obterContexto();
  } catch {
    // Navegador sem suporte ou áudio bloqueado: o sorteio segue sem som
  }
}

export function playDraftSound(pitch = 440) {
  try {
    const ctx = obterContexto();
    if (!ctx) return;
    tocarNota(ctx, pitch, ctx.currentTime);
  } catch {
    // Navegador sem suporte ou áudio bloqueado: segue sem som
  }
}

export function playCelebrationSound() {
  try {
    const ctx = obterContexto();
    if (!ctx) return;
    // Arpejo Dó-Mi-Sol-Dó agendado no relógio do próprio áudio, sem setTimeout
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      tocarNota(ctx, freq, ctx.currentTime + i * 0.11);
    });
  } catch {
    // Navegador sem suporte ou áudio bloqueado: segue sem som
  }
}
