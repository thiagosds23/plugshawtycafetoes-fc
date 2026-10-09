import React from 'react';
import { motion } from 'framer-motion';
import { Goal, Footprints } from 'lucide-react';
import { calcOVR, calcTeamOVR } from '../../utils/ovr';
import { formatPhotoUrl } from '../../config';
import { getPrimaryName } from '../../utils/formatters';

// Posições de cada setor do campo. Ficam num lugar só porque decidem tanto a linha
// em que o atleta aparece quanto a cor do selo de posição.
const POSICOES_DEFESA = ['ZAG', 'LAT', 'DEF', 'LE', 'LD'];
const POSICOES_MEIO = ['VOL', 'MEI', 'MC'];
const POSICOES_LATERAL = ['LAT', 'LE', 'LD'];

const COR_DO_SETOR = { gol: '#fbbf24', defesa: '#38bdf8', meio: '#00f59b', ataque: '#f43f5e' };

const posicaoDe = (p) => (p.position || 'MEI').toUpperCase();

/** Setor da posição: goleiro, defesa, meio ou ataque (qualquer outra posição). */
const setorDaPosicao = (pos) => {
  if (pos === 'GOL') return 'gol';
  if (POSICOES_DEFESA.includes(pos)) return 'defesa';
  if (POSICOES_MEIO.includes(pos)) return 'meio';
  return 'ataque';
};

// Laterais nas pontas da linha de defesa, zagueiros no meio
const sortDefensiveLine = (defList) => {
  const isLateral = (p) => POSICOES_LATERAL.includes((p.position || '').toUpperCase());
  const laterais = defList.filter(isLateral);
  const zagueiros = defList.filter(p => !isLateral(p));

  if (laterais.length === 0) return zagueiros;
  if (laterais.length === 1) return [...laterais, ...zagueiros];
  return [laterais[0], ...zagueiros, laterais[1]];
};

/** Linhas do time em campo, do goleiro ao ataque (ou ao contrário, para o time de baixo). */
const groupTeamByLines = (teamPlayers, isTopTeam) => {
  const porSetor = { gol: [], defesa: [], meio: [], ataque: [] };
  (teamPlayers || []).forEach(p => porSetor[setorDaPosicao(posicaoDe(p))].push(p));

  const linhas = [
    { label: 'Goleiro', players: porSetor.gol },
    { label: 'Defesa', players: sortDefensiveLine(porSetor.defesa) },
    { label: 'Meio-Campo', players: porSetor.meio },
    { label: 'Ataque', players: porSetor.ataque }
  ];
  return isTopTeam ? linhas : linhas.reverse();
};

// Cores de cada time no campo
const TEMAS = [
  { cor: '#00f59b', brilhoAtleta: 'rgba(0, 245, 155, 0.45)', brilhoRotulo: 'rgba(0, 245, 155, 0.35)' },
  { cor: '#ffffff', brilhoAtleta: 'rgba(255, 255, 255, 0.45)', brilhoRotulo: 'rgba(255, 255, 255, 0.3)' }
];

/** Um atleta no campo: foto com borda do time, selos de OVR e posição, nome e gols. */
function AtletaNoCampo({ p, tema, gols, assists, onClick }) {
  const displayName = getPrimaryName(p.nickname, p.username);
  const pos = posicaoDe(p);
  const posColor = COR_DO_SETOR[setorDaPosicao(pos)];

  return (
    <div
      onClick={() => onClick && onClick(p)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'transform 0.18s',
        width: '100%',
        maxWidth: '84px',
        textAlign: 'center',
        margin: '0 auto'
      }}
      title="Toque para ver estatísticas e histórico"
    >
      {/* Avatar Circular com Borda Brilhante e Badges Flutuantes */}
      <div style={{ position: 'relative' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(7, 10, 16, 0.55)', backdropFilter: 'blur(3px)', border: `2px solid ${tema.cor}`, overflow: 'hidden', boxShadow: `0 0 14px ${tema.brilhoAtleta}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {p.photo ? (
            <img src={formatPhotoUrl(p.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, color: tema.cor, textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
              {p.username?.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Badge Flutuante de OVR */}
        <div style={{ position: 'absolute', top: -4, right: -6, background: '#07080c', border: `1px solid ${tema.cor}`, color: tema.cor, fontSize: '0.60rem', fontWeight: 900, padding: '1px 5px', borderRadius: '7px', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
          {calcOVR(p)}
        </div>

        {/* Badge Flutuante de Posição */}
        <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', background: posColor, color: '#07080c', fontSize: '0.52rem', fontWeight: 900, padding: '0 4px', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>
          {pos}
        </div>
      </div>

      {/* Rótulo com Nome e Contadores de Gol/Assist */}
      <div style={{ background: 'rgba(7, 8, 14, 0.94)', padding: '2px 7px', borderRadius: '7px', fontSize: '0.70rem', fontWeight: 800, color: '#fff', marginTop: '5px', whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.12)', maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', boxShadow: '0 4px 12px rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', gap: '3px' }}>
        <span>{displayName}</span>
        {gols > 0 && <span style={{ color: 'var(--primary)', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '1px' }}><Goal size={10} />{gols}</span>}
        {assists > 0 && <span style={{ color: '#fbbf24', fontSize: '0.66rem', display: 'inline-flex', alignItems: 'center', gap: '1px' }}><Footprints size={10} />{assists}</span>}
      </div>
    </div>
  );
}

/**
 * Um time no campo: o rótulo com nome e OVR e as linhas de atletas.
 * - `goleiroEmCima`: o time de cima tem o goleiro no alto; o de baixo, invertido.
 * - `rotuloEmBaixo`: o time de baixo mostra o rótulo depois das linhas.
 * - `destaque`: time sozinho no campo, com o rótulo um pouco maior.
 * - `espacamento`: o respiro entre o time e a linha do meio-campo.
 */
function TimeNoCampo({ time, tema, goleiroEmCima = true, rotuloEmBaixo = false, destaque = false, espacamento, ovrDoTime, getPlayerEventCount, onPlayerClick }) {
  const rotulo = (
    <div style={{ textAlign: 'center' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: destaque ? '0.84rem' : '0.80rem',
          fontWeight: 900,
          padding: destaque ? '5px 16px' : '4px 16px',
          borderRadius: destaque ? '16px' : '14px',
          background: 'rgba(7, 8, 12, 0.88)',
          color: tema.cor,
          border: `1.5px solid ${tema.cor}`,
          boxShadow: `0 0 ${destaque ? 16 : 14}px ${tema.brilhoRotulo}`,
          textTransform: 'uppercase',
          letterSpacing: '0.4px'
        }}
      >
        <span>{time.name}</span>
        <span style={{ opacity: 0.6 }}>•</span>
        <span>OVR {ovrDoTime}</span>
      </span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', zIndex: 5, ...espacamento }}>
      {!rotuloEmBaixo && rotulo}

      {groupTeamByLines(time.players, goleiroEmCima).map(line => {
        if (line.players.length === 0) return null;
        return (
          <div
            key={line.label}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${line.players.length}, 1fr)`,
              justifyItems: 'center',
              alignItems: 'center',
              width: '100%',
              maxWidth: '460px',
              margin: '0 auto',
              padding: '0 4px'
            }}
          >
            {line.players.map(p => (
              <AtletaNoCampo
                key={p.id}
                p={p}
                tema={tema}
                gols={getPlayerEventCount(p.id, 'goals')}
                assists={getPlayerEventCount(p.id, 'assists')}
                onClick={onPlayerClick}
              />
            ))}
          </div>
        );
      })}

      {rotuloEmBaixo && rotulo}
    </div>
  );
}

export default function TacticalPitch({
  match,
  abaDoCampo = 'both',
  onPlayerClick,
  getPlayerEventCount = () => 0,
  getTeamOVR = (team) => calcTeamOVR(team?.players)
}) {
  if (!match || !match.teams) return null;

  // O que é igual para todo time desenhado no campo
  const comum = { getPlayerEventCount, onPlayerClick };
  // Time sozinho no campo: 'team0' ou 'team1'
  const indiceSozinho = abaDoCampo === 'team0' ? 0 : 1;

  return (
    <motion.div 
      key="pitch-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ width: '100%', maxWidth: '500px', margin: '0 auto' }}
    >
      {/* Gramado Tático com Textura Hiper-Realista e Proporções de Transmissão */}
      <div 
        style={{
          width: '100%',
          minHeight: abaDoCampo === 'both' ? '540px' : '430px',
          borderRadius: '22px',
          border: '2px solid rgba(255, 255, 255, 0.35)',
          position: 'relative',
          overflow: 'hidden',
          background: `
            radial-gradient(ellipse at 50% 10%, rgba(0, 245, 155, 0.22), transparent 60%),
            radial-gradient(ellipse at 50% 90%, rgba(255, 255, 255, 0.14), transparent 60%),
            radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.45) 100%),
            repeating-linear-gradient(0deg, #0b2e13 0px, #0b2e13 40px, #0e3817 40px, #0e3817 80px)
          `,
          boxShadow: 'inset 0 0 80px rgba(0,0,0,0.7), 0 16px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 6px'
        }}
      >
        {/* Linhas Demarcatórias Oficiais do Campo */}
        <div style={{ position: 'absolute', inset: '8px', border: '2px solid rgba(255,255,255,0.45)', borderRadius: '14px', pointerEvents: 'none' }} />

        {/* Linha do Meio de Campo e Círculo Central */}
        {abaDoCampo === 'both' && (
          <>
            <div style={{ position: 'absolute', top: '50%', left: '8px', right: '8px', height: '2px', background: 'rgba(255,255,255,0.45)', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: '118px', height: '118px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.45)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />

            {/* Escudo Oficial do Clube em Marca d'Água */}
            <div 
              style={{ 
                position: 'absolute', 
                top: '50%', 
                left: '50%', 
                transform: 'translate(-50%, -50%)', 
                width: '114px', 
                height: '114px', 
                borderRadius: '50%', 
                overflow: 'hidden', 
                opacity: 0.28, 
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2
              }}
            >
              <img src="/logo.jpeg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </>
        )}

        {/* Grande Área e Gol Superior */}
        <div style={{ position: 'absolute', top: '8px', left: '50%', width: '190px', height: '68px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: '50%', width: '88px', height: '24px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', transform: 'translateX(-50%)' }} />
          <div style={{ position: 'absolute', bottom: '12px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)' }} />
          <div style={{ position: 'absolute', bottom: '-20px', left: '50%', width: '56px', height: '20px', border: '2px solid rgba(255,255,255,0.45)', borderTop: 'none', borderRadius: '0 0 50px 50px', transform: 'translateX(-50%)' }} />
        </div>

        {/* Grande Área e Gol Inferior */}
        <div style={{ position: 'absolute', bottom: '8px', left: '50%', width: '190px', height: '68px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', bottom: 0, left: '50%', width: '88px', height: '24px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', transform: 'translateX(-50%)' }} />
          <div style={{ position: 'absolute', top: '12px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)' }} />
          <div style={{ position: 'absolute', top: '-20px', left: '50%', width: '56px', height: '20px', border: '2px solid rgba(255,255,255,0.45)', borderBottom: 'none', borderRadius: '50px 50px 0 0', transform: 'translateX(-50%)' }} />
        </div>

        {/* Arcos de Escanteio */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', width: '20px', height: '20px', borderRight: '2px solid rgba(255,255,255,0.45)', borderBottom: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 0 20px 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderLeft: '2px solid rgba(255,255,255,0.45)', borderBottom: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 0 0 20px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '20px', height: '20px', borderRight: '2px solid rgba(255,255,255,0.45)', borderTop: '2px solid rgba(255,255,255,0.45)', borderRadius: '0 20px 0 0', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '20px', height: '20px', borderLeft: '2px solid rgba(255,255,255,0.45)', borderTop: '2px solid rgba(255,255,255,0.45)', borderRadius: '20px 0 0 0', pointerEvents: 'none' }} />

        {/* Renderização Tática dos Jogadores */}
        {abaDoCampo === 'both' ? (
          <>
            {/* Metade Superior: Time 0 */}
            {match.teams[0] && (
              <TimeNoCampo
                {...comum}
                time={match.teams[0]}
                tema={TEMAS[0]}
                ovrDoTime={getTeamOVR(match.teams[0])}
                espacamento={{ paddingBottom: '10px' }}
              />
            )}

            {/* Metade Inferior: Time 1, de frente para o time de cima */}
            {match.teams[1] && (
              <TimeNoCampo
                {...comum}
                time={match.teams[1]}
                tema={TEMAS[1]}
                ovrDoTime={getTeamOVR(match.teams[1])}
                goleiroEmCima={false}
                rotuloEmBaixo
                espacamento={{ paddingTop: '10px' }}
              />
            )}
          </>
        ) : (
          match.teams[indiceSozinho] && (
            <TimeNoCampo
              {...comum}
              time={match.teams[indiceSozinho]}
              tema={TEMAS[indiceSozinho]}
              ovrDoTime={getTeamOVR(match.teams[indiceSozinho])}
              destaque
              espacamento={{ padding: '12px 0' }}
            />
          )
        )}
      </div>
    </motion.div>
  );
}
