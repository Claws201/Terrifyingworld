// backend/worldThreatConfig.js

// Base progress % per second per point of agent power.
// Increased so each agent contributes more.
const WORLD_THREAT_BASE_PROGRESS_RATE = 0.002;

// Default lifetime of a world threat in minutes
// 3 hours = 180 minutes
const DEFAULT_LIFETIME_MINUTES = 180;

// Templates: mirror your WORLD_THREATS_LIBRARY (simplified version here)
const threatTemplates = [
  {
    id: "wt_ito",
    name: "The Spiral's Embrace",
    description:
      "Intel from Kurouzu-cho, Japan, has ceased. Final fragmented reports spoke of a town obsessed... with spirals. This is not a localized hysteria; it's a memetic contagion warping reality. Your team must enter the town, find the epicenter of the curse, and break it before it consumes the entire continent.",
    zone: "Asia",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",
    skills: ["Psychology", "Research"],
    difficulty: 8,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
  {
    id: "wt_re",
    name: "The Tyrant Hunt",
    description:
      "The advanced Tyrant specimen that escaped The Hive has been tracked to the Arklay Mountains. It's adapting, regenerating, and becoming more powerful. If it reaches a populated area, the results will be catastrophic. Intercept and neutralize it, permanently.",
    zone: "North America",
    theme: "RESIDENT_EVIL",
    primaryStat: "Courage",
    skills: ["Firearms", "Biology"],
    difficulty: 9,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
  {
    id: "wt_lovecraft",
    name: "The Star-Spawn's Call",
    description:
      "A coastal town in France is reporting mass hysteria and nightmares of a sunken city. A psychic resonance is growing, heralding the awakening of something ancient. Disrupt the ritual before it completes.",
    zone: "Europe",
    theme: "LOVECRAFTIAN",
    primaryStat: "Occultism",
    skills: [],
    difficulty: 10,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
  {
    id: "wt_conjuring",
    name: "The Perron Farmhouse",
    description:
      "A remote farmhouse in Rhode Island is experiencing a violent poltergeist manifestation, escalating at an alarming rate. This is no simple haunting; it's a demonic infestation seeking a host. Your team must perform a full exorcism before the entity latches onto the family.",
    zone: "North America",
    theme: "FOLKLORE",
    primaryStat: "Occultism",
    skills: ["Exorcism", "Theology"],
    difficulty: 7,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
];

// Create a live instance from a template
function createThreatInstance(template) {
  const now = new Date();

  const expiresAt = new Date(
    now.getTime() +
      (template.lifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES) * 60 * 1000
  ).toISOString();

  return {
    instanceId: `${template.id}-${Math.random().toString(36).slice(2, 10)}`,
    templateId: template.id,
    name: template.name,
    description: template.description,
    zone: template.zone,
    theme: template.theme,
    primaryStat: template.primaryStat,
    skills: template.skills,
    difficulty: template.difficulty,

    // progress in PERCENT, from 0 -> 100
    progress: 0,
    status: "active", // "active" | "cleared" | "expired"
    assignedAgents: [], // [{ playerId, directorName, agents: AgentSnapshot[] }]
    createdAt: now.toISOString(),
    lastTick: now.toISOString(),
    expiresAt,
  };
}

module.exports = {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  threatTemplates,
  createThreatInstance,
};
