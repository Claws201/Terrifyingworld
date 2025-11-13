// worldThreatConfig.js
// Central config for World Threats & constants

// Base progress % per second per point of agent power (global speed knob)
const WORLD_THREAT_BASE_PROGRESS_RATE = 0.001;

// Per-agent drain per minute (server uses these if not overridden)
const AGENT_HEALTH_LOSS_PER_MINUTE = 1; // HP/min
const AGENT_SANITY_LOSS_PER_MINUTE = 2; // SAN/min

// Default lifetime (minutes) if a template doesn't specify
const DEFAULT_LIFETIME_MINUTES = 180; // 3 hours

// Cooldown minutes after a threat ends before auto-spawn allowed
const COOLDOWN_MINUTES_AFTER_END = 30;

// ---------------- Threat Templates ----------------
// You can add many; vary difficulty AND lifetimeMinutes if desired.
const threatTemplates = [
  {
    id: "wt_ito",
    name: "The Spiral's Embrace",
    description:
      "Intel from Kurouzu-cho, Japan, has ceased. Final fragmented reports spoke of a town obsessed... with spirals. This is not a localized hysteria; it's a memetic contagion warping reality. Enter the town, find the epicenter, and break it before it consumes the continent.",
    zone: "Asia",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",
    skills: ["Psychology", "Research"],
    difficulty: 8,
    lifetimeMinutes: 150, // slightly shorter than default
  },
  {
    id: "wt_re",
    name: "The Tyrant Hunt",
    description:
      "An advanced Tyrant specimen escaped The Hive. Tracked to the Arklay Mountains—adapting, regenerating, getting smarter. Intercept and neutralize before it reaches civilians.",
    zone: "North America",
    theme: "RESIDENT_EVIL",
    primaryStat: "Courage",
    skills: ["Firearms", "Biology"],
    difficulty: 9,
    lifetimeMinutes: 180, // standard 3h
  },
  {
    id: "wt_lovecraft",
    name: "The Star-Spawn's Call",
    description:
      "A coastal town dreams of a sunken city. The resonance rises, heralding something ancient. Disrupt the rite before it completes.",
    zone: "Europe",
    theme: "LOVECRAFTIAN",
    primaryStat: "Occultism",
    skills: ["Theology", "Linguistics"],
    difficulty: 10, // baseline difficulty (no easing)
    lifetimeMinutes: 180,
  },
  {
    id: "wt_conjuring",
    name: "The Perron Farmhouse",
    description:
      "A remote farmhouse sees violent poltergeist manifestations—the signs of an active demonic infestation seeking a host. Perform a full exorcism before it anchors.",
    zone: "North America",
    theme: "FOLKLORE",
    primaryStat: "Occultism",
    skills: ["Exorcism", "Theology"],
    difficulty: 7,
    lifetimeMinutes: 120, // shorter window; also easier via difficulty easing
  },
];

// Create a live instance from a template
function createThreatInstance(template) {
  const now = new Date();
  const minutes = template.lifetimeMinutes ?? DEFAULT_LIFETIME_MINUTES;
  const expiresAt = new Date(now.getTime() + minutes * 60 * 1000).toISOString();

  return {
    instanceId: `${template.id}-${Math.random().toString(36).slice(2, 10)}`,
    templateId: template.id,
    name: template.name,
    description: template.description,
    zone: template.zone,
    theme: template.theme,
    primaryStat: template.primaryStat, // "Courage" | "Investigation" | "Occultism"
    skills: template.skills || [],
    difficulty: template.difficulty ?? 10,

    // runtime fields
    progress: 0, // percent
    status: "active", // "active" | "cleared" | "expired"
    assignedAgents: [], // [{ playerId, directorName, agents: AgentSnapshot[] }]
    createdAt: now.toISOString(),
    lastTick: now.toISOString(),
    expiresAt,
  };
}

module.exports = {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  AGENT_HEALTH_LOSS_PER_MINUTE,
  AGENT_SANITY_LOSS_PER_MINUTE,
  COOLDOWN_MINUTES_AFTER_END,
  DEFAULT_LIFETIME_MINUTES,
  threatTemplates,
  createThreatInstance,
};
