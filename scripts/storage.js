export const MWD = {
  MODULE_ID: "mirkwood-tools-dashboard",
  SETTINGS_KEY: "worldState",
  ACTIVE_PROFILE_KEY: "activeProfileId"
};

export function randomID() {
  return foundry.utils.randomID();
}

export function clampNumber(n, min, max, fallback = min) {
  const x = Number.isFinite(Number(n)) ? Number(n) : fallback;
  return Math.min(max, Math.max(min, x));
}

export function defaultProfile(name = "Wilderland") {
  const id = randomID();
  return {
    id,
    name,
    globals: { shadow: 4, war: 1 },
    params: {
      pricePerDanger: 5,
      availMinusPerDanger: 15,
      availPlusPerSupply: 10,
      smugglePerDanger: 10,
      smugglePerUnrest: 5,
      smugglePerWar: 5,
      smugglePerSupplyBelow3: 10,
      detectPerDanger: 5,
      detectPerUnrest: 5,
      detectPerWar: 5
    },
    speciesMatrix: {
      // optional, frei erweiterbar:
      // "Elf->Dwarf": -2
    },
    regions: [
      {
        id: randomID(),
        name: "Default Region",
        danger: 2,
        unrest: 2,
        supply: 3,
        notes: ""
      }
    ],
    logs: []
  };
}

export function defaultState() {
  const p = defaultProfile("Wilderland");
  return { profiles: [p], activeProfileId: p.id };
}

export async function getState() {
  const stored = game.settings.get(MWD.MODULE_ID, MWD.SETTINGS_KEY);
  if (!stored || !stored.profiles?.length) return defaultState();
  return stored;
}

export async function setState(state) {
  await game.settings.set(MWD.MODULE_ID, MWD.SETTINGS_KEY, state);
}

export function findActiveProfile(state) {
  return state.profiles.find(p => p.id === state.activeProfileId) ?? state.profiles[0];
}