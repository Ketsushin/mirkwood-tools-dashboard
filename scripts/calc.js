import { clampNumber } from "./storage.js";

/**
 * Derived calculations from:
 * globals: shadow(0-10), war(0-5)
 * region: danger(0-5), unrest(0-5), supply(0-5)
 * params: see defaults
 *
 * Option B:
 * - Buy factor  = marketPct/100
 * - Sell factor = 0.5 * (marketPct/100)
 */
export function computeDerived({ profile, region }) {
  const g = profile.globals;
  const p = profile.params;

  const shadow = clampNumber(g.shadow, 0, 10, 0);
  const war = clampNumber(g.war, 0, 5, 0);

  const danger = clampNumber(region.danger, 0, 5, 0);
  const unrest = clampNumber(region.unrest, 0, 5, 0);
  const supply = clampNumber(region.supply, 0, 5, 3);

  // Price modifier
  const dangerPrice = danger * Number(p.pricePerDanger ?? 5);

  // Supply price mapping: 0-1 +10, 2 +5, 3 0, 4 -5, 5 -10
  let supplyPrice = 0;
  if (supply <= 1) supplyPrice = 10;
  else if (supply === 2) supplyPrice = 5;
  else if (supply === 4) supplyPrice = -5;
  else if (supply === 5) supplyPrice = -10;

  const marketPct = 100 + dangerPrice + supplyPrice;

  // Option B factors
  const buyFactor = marketPct / 100;
  const sellFactor = 0.5 * buyFactor; // 50% baseline * market

  // Availability
  const availability = clampNumber(
    100 - (danger * Number(p.availMinusPerDanger ?? 15)) + (supply * Number(p.availPlusPerSupply ?? 10)),
    0,
    100,
    100
  );

  // Smuggle chance (capped 0-100)
  const supplyBelow3 = Math.max(0, 3 - supply);
  const smuggle = clampNumber(
    (danger * Number(p.smugglePerDanger ?? 10)) +
      (unrest * Number(p.smugglePerUnrest ?? 5)) +
      (war * Number(p.smugglePerWar ?? 5)) +
      (supplyBelow3 * Number(p.smugglePerSupplyBelow3 ?? 10)),
    0,
    100,
    0
  );

  // Smuggle detection risk (capped 0-100)
  const detect = clampNumber(
    (danger * Number(p.detectPerDanger ?? 5)) +
      (unrest * Number(p.detectPerUnrest ?? 5)) +
      (war * Number(p.detectPerWar ?? 5)),
    0,
    100,
    0
  );

  // NPC baseline attitude vs outsiders
  let attitudeScore = 0;

  // Shadow effect on outsiders
  if (shadow >= 7) attitudeScore -= 2;
  else if (shadow >= 4) attitudeScore -= 1;

  // Unrest penalizes outsiders directly
  attitudeScore -= unrest;

  // Low supply makes merchants less friendly (small)
  if (supply <= 1) attitudeScore -= 1;

  // War tension makes strangers more suspicious at baseline
  if (war >= 3) attitudeScore -= 1;

  const { attitudeLabel, attitudeClass } = mapAttitude(attitudeScore);
  const reason = `Score ${attitudeScore} (Schatten ${shadow}, Unruhe ${unrest}, Versorgung ${supply}, Krieg ${war})`;

  return {
    marketPct,
    buyFactor,
    sellFactor,
    availability,
    smuggle,
    detect,
    attitudeScore,
    attitudeLabel,
    attitudeClass,
    reason
  };
}

function mapAttitude(score) {
  if (score >= 2) return { attitudeLabel: "freundlich", attitudeClass: "friendly" };
  if (score >= 0) return { attitudeLabel: "neutral", attitudeClass: "neutral" };
  if (score >= -2) return { attitudeLabel: "misstrauisch", attitudeClass: "wary" };
  if (score >= -4) return { attitudeLabel: "feindselig", attitudeClass: "hostile" };
  return { attitudeLabel: "aggressiv", attitudeClass: "aggressive" };
}