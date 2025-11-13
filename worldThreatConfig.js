// backend/worldThreatConfig.js

// Same meaning as in your game:
// "Base progress % per second per point of agent power"
const WORLD_THREAT_BASE_PROGRESS_RATE = 0.0003;

// Default lifetime of a world threat in minutes (for expiry timer)
const DEFAULT_LIFETIME_MINUTES = 60 * 24; // 24 hours

// Templates: mirror your WORLD_THREATS_LIBRARY
const threatTemplates = [
  {
    id: "wt_ito",
    name: "The Spiral's Embrace",
    description: "Reality twists into impossible spirals.",
    zone: "Asia",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",          // used for agent power
    skills: ["Psychology", "Research"],
    difficulty: 8,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
  {
    id: "wt_re",
    name: "The Tyrant Hunt",
    description: "A bio-weapon stalks the ruins of a city.",
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
    description: "Distant stars whisper to unstable minds.",
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
    description: "A haunted farmhouse draws in the unwary.",
    zone: "North America",
    theme: "FOLKLORE",
    primaryStat: "Occultism",
    skills: ["Exorcism", "Theology"],
    difficulty: 7,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES,
  },
];

// Helper to create live instance from template
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
    expiresAt, // ISO timestamp when this threat expires
  };
}

module.exports = {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  threatTemplates,
  createThreatInstance,
};
