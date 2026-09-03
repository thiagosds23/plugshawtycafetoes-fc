/**
 * Official Position-Weighted OVR Calculator (EA Sports FC / FIFA Standard)
 * Weighted by the key attributes that define each football position.
 */
export function calcOVR(player) {
  if (!player) return 50;
  const pac = Number(player.pace) || 50;
  const sho = Number(player.shooting) || 50;
  const pas = Number(player.passing) || 50;
  const dri = Number(player.dribbling) || 50;
  const def = Number(player.defending) || 50;
  const phy = Number(player.physical) || 50;
  const pos = (player.position || 'MEI').toUpperCase().trim();

  let ovr = 50;
  switch (pos) {
    case 'ATA':
      // Atacante: Finalização (40%), Ritmo (25%), Drible (20%), Físico (10%), Passe (5%)
      ovr = (sho * 0.40) + (pac * 0.25) + (dri * 0.20) + (phy * 0.10) + (pas * 0.05);
      break;

    case 'MEI':
      // Meia: Passe (35%), Drible (25%), Chute (20%), Ritmo (10%), Físico (7%), Defesa (3%)
      ovr = (pas * 0.35) + (dri * 0.25) + (sho * 0.20) + (pac * 0.10) + (phy * 0.07) + (def * 0.03);
      break;

    case 'VOL':
      // Volante: Defesa (35%), Físico (25%), Passe (20%), Ritmo (10%), Drible (10%)
      ovr = (def * 0.35) + (phy * 0.25) + (pas * 0.20) + (pac * 0.10) + (dri * 0.10);
      break;

    case 'ZAG':
      // Zagueiro: Defesa (45%), Físico (30%), Ritmo (15%), Passe (10%)
      ovr = (def * 0.45) + (phy * 0.30) + (pac * 0.15) + (pas * 0.10);
      break;

    case 'LAT':
      // Lateral: Ritmo (30%), Defesa (25%), Físico (20%), Passe (15%), Drible (10%)
      ovr = (pac * 0.30) + (def * 0.25) + (phy * 0.20) + (pas * 0.15) + (dri * 0.10);
      break;

    case 'GOL':
      // Goleiro: Defesa/Reflexos (40%), Físico (30%), Ritmo/Explosão (15%), Passe/Reposição (15%)
      ovr = (def * 0.40) + (phy * 0.30) + (pac * 0.15) + (pas * 0.15);
      break;

    default:
      // Padrão / Posição não especificada: média balanceada
      ovr = (pac + sho + pas + dri + def + phy) / 6;
  }

  return Math.max(25, Math.min(99, Math.round(ovr)));
}
