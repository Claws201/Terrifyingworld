// backend/worldThreatConfig.js

// Base progress % per second per point of agent power.
// Increased so each agent contributes more.
const WORLD_THREAT_BASE_PROGRESS_RATE = 0.001;

// Default lifetime of a world threat in minutes
// 3 hours = 180 minutes
const DEFAULT_LIFETIME_MINUTES = 180;

// IMPORTANT NOTES WHEN EDITING TEXT:
// - Always use straight double quotes "like this", not “smart quotes”.
// - If you need an apostrophe, prefer double quotes outside:
//   description: "The world's edge is fraying."
// - Make sure every object in the array is separated by a comma.

const threatTemplates = [
  {
    id: "wt_ito",
    name: "The Spiral's Embrace",
    description: "Reality twists into impossible spirals, dragging minds and architecture into impossible geometries.",
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
    description: "A bio-weapon stalks the ruins of a quarantined city, and every hour without containment spawns new horrors.",
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
    description: "Distant stars hum a frequency only the unstable can hear. The longer it plays, the more minds it corrodes.",
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
    description: "A farmhouse that should have been abandoned decades ago still hosts something that refuses to leave.",
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
