import { useCallback, useEffect, useRef, useState } from "react";

export type GameClass = "rogue" | "mage" | "fighter" | "archer";

export type Combatant = {
  id: string;
  name: string;
  kind: "rival" | "mob";
  classId: GameClass;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
};

export type Chest = {
  id: string;
  x: number;
  y: number;
  opened: boolean;
};

export type SkillSlot = {
  id: string;
  name: string;
  description: string;
  level: number;
  icon: string;
  triggerSeconds: number;
};

export type ItemBonus = {
  attack: number;
  defense: number;
  maxHp: number;
  skillPower: number;
};

export type Item = {
  id: string;
  name: string;
  slot: "weapon" | "armor" | "relic";
  rarity: "uncommon" | "rare" | "epic";
  classId: GameClass;
  description: string;
  bonus: ItemBonus;
};

export type GameState = {
  phase: "playing" | "victory" | "defeat";
  classId: GameClass;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    nextXp: number;
    shield: number;
  };
  world: { width: number; height: number };
  timeSeconds: number;
  alivePlayers: number;
  kills: number;
  fog: {
    x: number;
    y: number;
    radius: number;
    initialRadius: number;
    stage: number;
    secondsToNext: number;
  };
  rivals: Combatant[];
  mobs: Combatant[];
  chests: Chest[];
  skills: SkillSlot[];
  inventory: Item[];
  eventLog: string[];
  dashCooldownSeconds: number;
  paused: boolean;
};

type Runtime = {
  movement: { x: number; y: number };
  lastDirection: { x: number; y: number };
  playerAttack: number;
  skillClocks: Record<string, number>;
  rivalClocks: Record<string, number>;
  mobClocks: Record<string, number>;
};

type ClassProfile = {
  hp: number;
  attack: number;
  defense: number;
  skills: Omit<SkillSlot, "level">[];
};

const CLASS_PROFILES: Record<GameClass, ClassProfile> = {
  rogue: {
    hp: 108,
    attack: 15,
    defense: 2,
    skills: [
      { id: "twin-fangs", name: "Twin Fangs", description: "A quick pair of automatic strikes.", icon: "fangs", triggerSeconds: 5 },
      { id: "hemorrhage", name: "Hemorrhage", description: "A precise strike that leaves a lasting wound.", icon: "bleed", triggerSeconds: 8 },
      { id: "evasion", name: "Evasion", description: "A brief defensive veil reduces incoming damage.", icon: "evasion", triggerSeconds: 14 },
      { id: "predators-mark", name: "Predator's Mark", description: "Deals extra damage to a nearby rival.", icon: "mark", triggerSeconds: 11 },
      { id: "shadow-guard", name: "Shadow Guard", description: "A short-lived shield forms automatically.", icon: "guard", triggerSeconds: 18 },
    ],
  },
  mage: {
    hp: 92,
    attack: 17,
    defense: 1,
    skills: [
      { id: "arcane-lance", name: "Arcane Lance", description: "A focused bolt seeks the nearest enemy.", icon: "lance", triggerSeconds: 5 },
      { id: "frost-nova", name: "Frost Nova", description: "A cold burst damages nearby enemies.", icon: "frost", triggerSeconds: 9 },
      { id: "mana-ward", name: "Mana Ward", description: "A defensive ward absorbs incoming damage.", icon: "ward", triggerSeconds: 15 },
      { id: "comet", name: "Falling Comet", description: "A heavy arcane impact strikes a nearby foe.", icon: "comet", triggerSeconds: 17 },
      { id: "spellweave", name: "Spellweave", description: "An arcane pulse strengthens your next attacks.", icon: "weave", triggerSeconds: 12 },
    ],
  },
  fighter: {
    hp: 138,
    attack: 17,
    defense: 5,
    skills: [
      { id: "cleave", name: "Cleave", description: "A wide automatic sweep hits nearby enemies.", icon: "cleave", triggerSeconds: 5 },
      { id: "iron-bulwark", name: "Iron Bulwark", description: "A strong shield builds up over time.", icon: "bulwark", triggerSeconds: 13 },
      { id: "riposte", name: "Riposte", description: "A guarded counterstrike punishes a nearby foe.", icon: "riposte", triggerSeconds: 8 },
      { id: "earthshatter", name: "Earthshatter", description: "A heavy blow damages and disrupts nearby enemies.", icon: "earth", triggerSeconds: 17 },
      { id: "battle-focus", name: "Battle Focus", description: "Briefly increases your protection and power.", icon: "focus", triggerSeconds: 16 },
    ],
  },
  archer: {
    hp: 104,
    attack: 14,
    defense: 2,
    skills: [
      { id: "multishot", name: "Multishot", description: "A volley automatically seeks nearby enemies.", icon: "volley", triggerSeconds: 5 },
      { id: "venom-arrow", name: "Venom Arrow", description: "A poisoned shot damages a target over time.", icon: "venom", triggerSeconds: 8 },
      { id: "quickstep", name: "Quickstep", description: "A light defensive ward forms as you reposition.", icon: "step", triggerSeconds: 13 },
      { id: "rain-of-arrows", name: "Rain of Arrows", description: "A broad volley punishes a nearby cluster.", icon: "rain", triggerSeconds: 17 },
      { id: "eagle-eye", name: "Eagle Eye", description: "A precise shot deals increased damage.", icon: "eye", triggerSeconds: 11 },
    ],
  },
};

const RIVAL_NAMES = [
  "Ashen Vow", "Mirewalker", "Thornwake", "Grave Lantern", "Red Hollow",
  "Wolfsbane", "Dusk Herald", "Cinder Warden", "Black Briar", "Vesper",
  "Hollow Crown", "Gloamrunner", "Sable Thorn", "Nightglass", "Ruinbound",
  "Emberfall", "Pale March", "Crowkeeper", "The Last Bell",
];

const MOB_NAMES = ["Rotfang Wolf", "Gravebound", "Mire Stalker", "Ashen Wretch"];

const LOOT: Record<GameClass, Item[]> = {
  rogue: [
    { id: "rogue-dagger", name: "Gloamfang Daggers", slot: "weapon", rarity: "rare", classId: "rogue", description: "Twin blades tuned for swift strikes.", bonus: { attack: 5, defense: 0, maxHp: 0, skillPower: 2 } },
    { id: "rogue-coat", name: "Umbral Leather", slot: "armor", rarity: "uncommon", classId: "rogue", description: "Darkened leather that turns glancing blows.", bonus: { attack: 0, defense: 3, maxHp: 12, skillPower: 0 } },
    { id: "rogue-relic", name: "Bloodglass Signet", slot: "relic", rarity: "epic", classId: "rogue", description: "Feeds precision and shadow techniques.", bonus: { attack: 2, defense: 1, maxHp: 0, skillPower: 5 } },
  ],
  mage: [
    { id: "mage-staff", name: "Starfall Branch", slot: "weapon", rarity: "rare", classId: "mage", description: "A carved focus that strengthens arcane skills.", bonus: { attack: 4, defense: 0, maxHp: 0, skillPower: 4 } },
    { id: "mage-robe", name: "Runespun Mantle", slot: "armor", rarity: "uncommon", classId: "mage", description: "Woven with warding thread.", bonus: { attack: 0, defense: 2, maxHp: 16, skillPower: 1 } },
    { id: "mage-relic", name: "Frostheart Prism", slot: "relic", rarity: "epic", classId: "mage", description: "Keeps the mind steady under pressure.", bonus: { attack: 1, defense: 2, maxHp: 0, skillPower: 5 } },
  ],
  fighter: [
    { id: "fighter-axe", name: "Oathbreaker Axe", slot: "weapon", rarity: "rare", classId: "fighter", description: "A broad head made for decisive cleaves.", bonus: { attack: 5, defense: 0, maxHp: 0, skillPower: 2 } },
    { id: "fighter-plate", name: "Black-Iron Harness", slot: "armor", rarity: "uncommon", classId: "fighter", description: "Heavy plates built to hold the line.", bonus: { attack: 0, defense: 5, maxHp: 20, skillPower: 0 } },
    { id: "fighter-relic", name: "Warden's Crest", slot: "relic", rarity: "epic", classId: "fighter", description: "Turns discipline into a stronger bulwark.", bonus: { attack: 2, defense: 2, maxHp: 8, skillPower: 3 } },
  ],
  archer: [
    { id: "archer-bow", name: "Hawkeye Longbow", slot: "weapon", rarity: "rare", classId: "archer", description: "A balanced bow for clean, fast volleys.", bonus: { attack: 5, defense: 0, maxHp: 0, skillPower: 2 } },
    { id: "archer-vest", name: "Briarhide Vest", slot: "armor", rarity: "uncommon", classId: "archer", description: "Flexible armor with a thorn-stitched lining.", bonus: { attack: 0, defense: 3, maxHp: 14, skillPower: 0 } },
    { id: "archer-relic", name: "Moonfeather Charm", slot: "relic", rarity: "epic", classId: "archer", description: "Carries a faint trace of the old forest.", bonus: { attack: 2, defense: 1, maxHp: 0, skillPower: 5 } },
  ],
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createRuntime(): Runtime {
  return {
    movement: { x: 0, y: 0 },
    lastDirection: { x: 0, y: -1 },
    playerAttack: 0.65,
    skillClocks: {},
    rivalClocks: {},
    mobClocks: {},
  };
}

function createInitialState(classId: GameClass): GameState {
  const profile = CLASS_PROFILES[classId];
  const rivals = RIVAL_NAMES.map((name, index) => {
    const angle = (Math.PI * 2 * index) / RIVAL_NAMES.length + randomBetween(-0.16, 0.16);
    const radius = randomBetween(285, 455);
    return {
      id: `rival-${index + 1}`,
      name,
      kind: "rival" as const,
      classId: (["rogue", "mage", "fighter", "archer"] as GameClass[])[index % 4],
      x: 500 + Math.cos(angle) * radius,
      y: 500 + Math.sin(angle) * radius,
      hp: 100 + (index % 4) * 8,
      maxHp: 100 + (index % 4) * 8,
      alive: true,
    };
  });
  const mobs = Array.from({ length: 13 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 13 + randomBetween(-0.2, 0.2);
    const radius = randomBetween(110, 390);
    const hp = 40 + (index % 3) * 12;
    return {
      id: `mob-${index + 1}`,
      name: MOB_NAMES[index % MOB_NAMES.length],
      kind: "mob" as const,
      classId,
      x: 500 + Math.cos(angle) * radius,
      y: 500 + Math.sin(angle) * radius,
      hp,
      maxHp: hp,
      alive: true,
    };
  });
  const chests = Array.from({ length: 12 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 12 + Math.PI / 12;
    const radius = 150 + (index % 3) * 105;
    return {
      id: `chest-${index + 1}`,
      x: 500 + Math.cos(angle) * radius,
      y: 500 + Math.sin(angle) * radius,
      opened: false,
    };
  });

  return {
    phase: "playing",
    classId,
    player: { x: 500, y: 500, hp: profile.hp, maxHp: profile.hp, level: 1, xp: 0, nextXp: 100, shield: 0 },
    world: { width: 1000, height: 1000 },
    timeSeconds: 0,
    alivePlayers: 20,
    kills: 0,
    fog: { x: 500, y: 500, radius: 470, initialRadius: 470, stage: 1, secondsToNext: 42 },
    rivals,
    mobs,
    chests,
    skills: profile.skills.map((skill) => ({ ...skill, level: 1 })),
    inventory: [],
    eventLog: ["The battleground has begun. Find gear and move toward the center."],
    dashCooldownSeconds: 0,
    paused: false,
  };
}

function addLog(state: GameState, message: string) {
  state.eventLog = [message, ...state.eventLog].slice(0, 7);
}

function totalBonus(state: GameState): ItemBonus {
  return state.inventory.reduce(
    (sum, item) => ({
      attack: sum.attack + item.bonus.attack,
      defense: sum.defense + item.bonus.defense,
      maxHp: sum.maxHp + item.bonus.maxHp,
      skillPower: sum.skillPower + item.bonus.skillPower,
    }),
    { attack: 0, defense: 0, maxHp: 0, skillPower: 0 },
  );
}

function gainXp(state: GameState, amount: number) {
  state.player.xp += amount;
  while (state.player.xp >= state.player.nextXp) {
    state.player.xp -= state.player.nextXp;
    state.player.level += 1;
    state.player.nextXp = 100 + state.player.level * 35;
    state.skills = state.skills.map((skill) => ({
      ...skill,
      level: Math.min(5, Math.floor((state.player.level - 1) / 2) + 1),
    }));
    addLog(state, `Level ${state.player.level}: your five skills grow stronger.`);
  }
}

function damageTarget(target: Combatant, amount: number) {
  if (!target.alive) return false;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) {
    target.alive = false;
    return true;
  }
  return false;
}

function applyPlayerDamage(state: GameState, rawDamage: number) {
  const bonus = totalBonus(state);
  const profile = CLASS_PROFILES[state.classId];
  const reduction = (profile.defense + bonus.defense) * 0.55;
  const damage = Math.max(1, rawDamage - reduction);
  const absorbed = Math.min(state.player.shield, damage);
  state.player.shield -= absorbed;
  state.player.hp = Math.max(0, state.player.hp - (damage - absorbed));
}

function moveToward(point: { x: number; y: number }, target: { x: number; y: number }, distance: number) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return;
  point.x += (dx / length) * distance;
  point.y += (dy / length) * distance;
  point.x = Math.max(8, Math.min(992, point.x));
  point.y = Math.max(8, Math.min(992, point.y));
}

function getNearest(
  source: { x: number; y: number },
  targets: Combatant[],
  maxDistance = Number.POSITIVE_INFINITY,
) {
  let nearest: Combatant | undefined;
  let distance = maxDistance;
  for (const target of targets) {
    if (!target.alive) continue;
    const nextDistance = Math.hypot(target.x - source.x, target.y - source.y);
    if (nextDistance < distance) {
      nearest = target;
      distance = nextDistance;
    }
  }
  return nearest ? { target: nearest, distance } : undefined;
}

function finishMatch(state: GameState) {
  if (state.player.hp <= 0) {
    state.phase = "defeat";
    addLog(state, "You have fallen. The battleground is lost.");
  } else if (state.alivePlayers <= 1) {
    state.phase = "victory";
    addLog(state, "The last rival has fallen. You are the survivor.");
  } else if (state.timeSeconds >= 210) {
    state.phase = "victory";
    addLog(state, "The final bell sounds. You survived the battleground.");
  }
}

function tickGame(state: GameState, runtime: Runtime, dt: number): GameState {
  const next: GameState = {
    ...state,
    player: { ...state.player },
    fog: { ...state.fog },
    rivals: state.rivals.map((rival) => ({ ...rival })),
    mobs: state.mobs.map((mob) => ({ ...mob })),
    chests: state.chests,
    skills: state.skills,
    inventory: state.inventory,
    eventLog: state.eventLog,
    timeSeconds: state.timeSeconds + dt,
    dashCooldownSeconds: Math.max(0, state.dashCooldownSeconds - dt),
  };

  const movementLength = Math.hypot(runtime.movement.x, runtime.movement.y);
  if (movementLength > 0) {
    const speed = 118 * dt;
    next.player.x += (runtime.movement.x / movementLength) * speed;
    next.player.y += (runtime.movement.y / movementLength) * speed;
    next.player.x = Math.max(8, Math.min(992, next.player.x));
    next.player.y = Math.max(8, Math.min(992, next.player.y));
  }

  const closeDuration = 174;
  const shrink = Math.min(1, next.timeSeconds / closeDuration);
  next.fog.radius = 470 - shrink * 330;
  next.fog.stage = Math.min(4, Math.floor(next.timeSeconds / 43.5) + 1);
  next.fog.secondsToNext = Math.max(0, 43.5 - (next.timeSeconds % 43.5));
  if (Math.hypot(next.player.x - next.fog.x, next.player.y - next.fog.y) > next.fog.radius) {
    applyPlayerDamage(next, 6 * dt);
  }

  const profile = CLASS_PROFILES[next.classId];
  const playerTargets = [...next.rivals, ...next.mobs];
  const bonus = totalBonus(next);
  runtime.playerAttack -= dt;
  if (runtime.playerAttack <= 0) {
    const nearest = getNearest(next.player, playerTargets, 118);
    if (nearest) {
      const killed = damageTarget(nearest.target, profile.attack + bonus.attack + bonus.skillPower * 0.25);
      runtime.playerAttack = 1.05;
      if (killed) {
        next.kills += 1;
        gainXp(next, nearest.target.kind === "mob" ? 35 : 70);
        addLog(next, `${nearest.target.kind === "mob" ? "Defeated" : "Eliminated"} ${nearest.target.name}.`);
      }
    } else {
      runtime.playerAttack = 0.2;
    }
  }

  next.skills = next.skills.map((skill) => {
    runtime.skillClocks[skill.id] = (runtime.skillClocks[skill.id] ?? skill.triggerSeconds) - dt;
    if (runtime.skillClocks[skill.id] > 0) return skill;
    runtime.skillClocks[skill.id] = skill.triggerSeconds;

    const isDefense = /ward|guard|evasion|bulwark|focus|quickstep/i.test(skill.id);
    if (isDefense) {
      const shield = 6 + skill.level * 3 + bonus.skillPower;
      next.player.shield = Math.min(60, next.player.shield + shield);
      return skill;
    }
    const skillTargets = [...next.rivals, ...next.mobs];
    const nearest = getNearest(next.player, skillTargets, /nova|cleave|earthshatter|rain-of-arrows/i.test(skill.id) ? 155 : 195);
    if (nearest) {
      const multiplier = /comet|earthshatter|rain-of-arrows|hemorrhage/i.test(skill.id) ? 1.55 : 1.05;
      const killed = damageTarget(nearest.target, (profile.attack + bonus.attack + bonus.skillPower) * multiplier * skill.level);
      if (killed) {
        next.kills += 1;
        gainXp(next, nearest.target.kind === "mob" ? 35 : 70);
        addLog(next, `${skill.name} defeats ${nearest.target.name}.`);
      } else {
        addLog(next, `${skill.name} strikes ${nearest.target.name}.`);
      }
    } else if (/ward|guard|evasion|bulwark|focus|quickstep/i.test(skill.id)) {
      next.player.shield = Math.min(60, next.player.shield + 8);
    }
    return skill;
  });

  const livingRivals = next.rivals.filter((rival) => rival.alive);
  for (const rival of livingRivals) {
    const hostileTargets = [
      ...next.rivals.filter((other) => other.alive && other.id !== rival.id),
      ...next.mobs.filter((mob) => mob.alive),
      ...(next.player.hp > 0
        ? [{
            id: "player",
            name: "You",
            kind: "rival" as const,
            classId: next.classId,
            x: next.player.x,
            y: next.player.y,
            hp: next.player.hp,
            maxHp: next.player.maxHp,
            alive: true,
          }]
        : []),
    ];
    const target = getNearest(rival, hostileTargets, 150);
    if (target && target.distance < 46) {
      runtime.rivalClocks[rival.id] = (runtime.rivalClocks[rival.id] ?? randomBetween(0.2, 1)) - dt;
      if (runtime.rivalClocks[rival.id] <= 0) {
        runtime.rivalClocks[rival.id] = 1.2;
        if (target.target.id === "player") applyPlayerDamage(next, 8 + (rival.classId === "fighter" ? 3 : 0));
        else {
          const killed = damageTarget(target.target, 9 + (rival.classId === "fighter" ? 2 : 0));
          if (killed && target.target.kind === "rival") addLog(next, `${rival.name} eliminates ${target.target.name}.`);
        }
      }
    } else if (target) {
      moveToward(rival, target.target, 38 * dt);
    } else {
      moveToward(rival, { x: 500, y: 500 }, 23 * dt);
    }
  }

  const livingMobs = next.mobs.filter((mob) => mob.alive);
  for (const mob of livingMobs) {
    const potentialTargets = [
      ...next.rivals.filter((rival) => rival.alive),
      ...(next.player.hp > 0
        ? [{
            id: "player",
            name: "You",
            kind: "rival" as const,
            classId: next.classId,
            x: next.player.x,
            y: next.player.y,
            hp: next.player.hp,
            maxHp: next.player.maxHp,
            alive: true,
          }]
        : []),
    ];
    const target = getNearest(mob, potentialTargets, 115);
    if (target && target.distance < 38) {
      runtime.mobClocks[mob.id] = (runtime.mobClocks[mob.id] ?? randomBetween(0.2, 0.8)) - dt;
      if (runtime.mobClocks[mob.id] <= 0) {
        runtime.mobClocks[mob.id] = 1.4;
        if (target.target.id === "player") applyPlayerDamage(next, 7);
        else damageTarget(target.target, 7);
      }
    } else if (target) {
      moveToward(mob, target.target, 20 * dt);
    }
  }

  next.alivePlayers = 1 + next.rivals.filter((rival) => rival.alive).length;
  finishMatch(next);
  return next;
}

export function useGameEngine(classId: GameClass, active: boolean) {
  const [state, setState] = useState<GameState>(() => createInitialState(classId));
  const stateRef = useRef(state);
  const runtimeRef = useRef<Runtime>(createRuntime());
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (!active) runtimeRef.current.movement = { x: 0, y: 0 };
  }, [active]);

  useEffect(() => {
    const reset = createInitialState(classId);
    stateRef.current = reset;
    runtimeRef.current = createRuntime();
    setState(reset);
  }, [classId]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (current.phase !== "playing" || current.paused || !activeRef.current) return;
      const next = tickGame(current, runtimeRef.current, 0.25);
      stateRef.current = next;
      setState(next);
    }, 250);
    return () => window.clearInterval(interval);
  }, [active]);

  const move = useCallback((dx: number, dy: number) => {
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      runtimeRef.current.movement = { x: dx / length, y: dy / length };
      runtimeRef.current.lastDirection = { x: dx / length, y: dy / length };
    } else {
      runtimeRef.current.movement = { x: 0, y: 0 };
    }
  }, []);

  const dash = useCallback((dx: number, dy: number) => {
    const current = stateRef.current;
    if (current.phase !== "playing" || current.paused || current.dashCooldownSeconds > 0) return;
    let direction = { x: dx, y: dy };
    if (Math.hypot(direction.x, direction.y) < 0.001) direction = runtimeRef.current.lastDirection;
    const length = Math.hypot(direction.x, direction.y) || 1;
    const next = {
      ...current,
      player: {
        ...current.player,
        x: Math.max(8, Math.min(992, current.player.x + (direction.x / length) * 138)),
        y: Math.max(8, Math.min(992, current.player.y + (direction.y / length) * 138)),
      },
      dashCooldownSeconds: 6,
      eventLog: ["You dash through the gloom.", ...current.eventLog].slice(0, 7),
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const openChest = useCallback((chestId: string) => {
    const current = stateRef.current;
    if (current.phase !== "playing" || current.paused) return;
    const chest = current.chests.find((candidate) => candidate.id === chestId);
    if (!chest || chest.opened) return;
    if (Math.hypot(chest.x - current.player.x, chest.y - current.player.y) > 68) {
      const next = { ...current, eventLog: ["You are too far from that chest.", ...current.eventLog].slice(0, 7) };
      stateRef.current = next;
      setState(next);
      return;
    }

    const openedCount = current.chests.filter((candidate) => candidate.opened).length;
    const lootTable = LOOT[current.classId];
    const item = lootTable[openedCount % lootTable.length];
    const next: GameState = {
      ...current,
      player: { ...current.player },
      chests: current.chests.map((candidate) => candidate.id === chestId ? { ...candidate, opened: true } : candidate),
      inventory: [...current.inventory, item],
      eventLog: [`Found ${item.name} — ${item.description}`, ...current.eventLog].slice(0, 7),
    };
    next.player.maxHp += item.bonus.maxHp;
    next.player.hp = Math.min(next.player.maxHp, next.player.hp + 22 + item.bonus.maxHp);
    next.player.shield = Math.min(60, next.player.shield + item.bonus.defense * 2);
    stateRef.current = next;
    setState(next);
  }, []);

  const restart = useCallback(() => {
    const next = createInitialState(classId);
    stateRef.current = next;
    runtimeRef.current = createRuntime();
    setState(next);
  }, [classId]);

  const pause = useCallback(() => {
    const next = { ...stateRef.current, paused: !stateRef.current.paused };
    if (next.paused) runtimeRef.current.movement = { x: 0, y: 0 };
    stateRef.current = next;
    setState(next);
  }, []);

  return { state, move, dash, openChest, restart, pause };
}
