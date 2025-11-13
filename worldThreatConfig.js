// backend/worldThreatConfig.js

// Base progress % per second per point of agent power.
// Increased so each agent contributes more.
const WORLD_THREAT_BASE_PROGRESS_RATE = 0.002;

// Default lifetime of a world threat in minutes
// 3 hours = 180 minutes
const DEFAULT_LIFETIME_MINUTES = 180;

/**
 * threatTemplates:
 *  - id MUST match the frontend WORLD_THREATS_LIBRARY id
 *  - difficulty: higher = slower progress for the same agents
 *  - lifetimeMinutes: how long before it expires if not cleared
 */
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
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES, // 180
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
    lifetimeMinutes: 150, // 2.5 hours – high pressure bio-weapon hunt
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
    lifetimeMinutes: 240, // 4 hours – big cosmic boss
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
    lifetimeMinutes: 120, // 2 hours – intense but shorter haunt
  },

  // ----------------------
  // New world threats
  // ----------------------

  {
    id: "wt_motel_13",
    name: "Vacancy at Room 13",
    description:
      "A dying highway in Nevada is kept alive by a single, flickering motel. Guests who stay in Room 13 check in with human faces and check out with something else staring from behind their eyes. Local police stopped responding after the dashcam of a responding cruiser looped 39 seconds of static and screaming. You must quarantine the site, identify the locus, and evict whatever entity has claimed permanent residence.",
    zone: "North America",
    theme: "FOLKLORE",
    primaryStat: "Investigation",
    skills: ["Psychology"],
    difficulty: 3,
    lifetimeMinutes: 90, // 1.5 hours – easy, shorter window
  },
  {
    id: "wt_metro_whispers",
    name: "Whispers in the Metro Line",
    description:
      "Commuters on a major European metro line are reporting voices urging them to step over the platform edge and onto the tracks. Security footage shows passengers arguing with something that is not there. The line has been closed 'for maintenance', but the pressure of rush hour is building. Track the origin of the whispers through the tunnels before a mass 'accident' is written into the timetable.",
    zone: "Europe",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",
    skills: ["Linguistics", "Research"],
    difficulty: 4,
    lifetimeMinutes: 90, // shorter, mid-low difficulty
  },
  {
    id: "wt_deep_shaft",
    name: "Signal from the Deep Shaft",
    description:
      "A remote mining operation drilled into a hollow cavity far below surveyed strata. Equipment readings became contradictory, clocks began to desynchronize, and workers report a 'song' vibrating in their teeth. The company has threatened legal action against interference, unaware that something is tunneling upwards toward the surface. Descend, map the anomaly, and collapse the shaft before the song finds a new chorus.",
    zone: "South America",
    theme: "LOVECRAFTIAN",
    primaryStat: "Courage",
    skills: ["Engineering", "Geology"],
    difficulty: 5,
    lifetimeMinutes: 150, // 2.5 hours
  },
  {
    id: "wt_blood_moon",
    name: "The Red Horizon Vigil",
    description:
      "A rural region reports livestock born already mummified and a moon that will not set, even in daylight. Satellite imagery shows a crimson tint isolated over a single valley, unaffected by atmospheric conditions. Old rituals once kept this vigil in check; the last keeper died without a successor. Your team must reconstruct the rite from fragmented oral histories before the red horizon spreads across the whole continent.",
    zone: "Africa",
    theme: "FOLKLORE",
    primaryStat: "Occultism",
    skills: ["Theology", "Research"],
    difficulty: 5,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES, // 180
  },
  {
    id: "wt_data_ghost_storm",
    name: "The Data-Ghost Storm",
    description:
      "A cloud service provider in Singapore reports a rolling blackout that exists only in their logs. Servers register catastrophic errors, yet uptime is unaffected. Analysts attempting to debug the issue report migraines, nosebleeds, and repeating dreams of a static-filled ocean. A self-spreading 'ghost process' is attempting to propagate across the global backbone. Enter the data center, isolate the seed, and exorcise the code before it learns to rewrite more than software.",
    zone: "Asia",
    theme: "LOVECRAFTIAN",
    primaryStat: "Investigation",
    skills: ["Research", "Psychology"],
    difficulty: 6,
    lifetimeMinutes: 120, // 2 hours
  },
  {
    id: "wt_plague_procession",
    name: "The Plague Procession",
    description:
      "An unregistered religious procession walks the back roads between villages, singing in a language no database recognizes. People who glimpse the parade develop black lesions in the pattern of footprints, as if something walked across their skin. The procession never appears on recorded video longer than a single frame. Track its route, identify the herald, and break the chain of contagion before it reaches a major city.",
    zone: "Europe",
    theme: "FOLKLORE",
    primaryStat: "Occultism",
    skills: ["Biology", "Theology"],
    difficulty: 6,
    lifetimeMinutes: 150, // 2.5 hours
  },
  {
    id: "wt_drowned_signal",
    name: "The Drowned Broadcast",
    description:
      "Late-night radio stations along a storm-battered coastline report emergency broadcasts that were never sent, urging listeners to 'follow the tide line inland'. Tuning to the frequency induces a sensation of lungs filling with cold saltwater. Archival checks show the call sign belongs to a station that sunk with a research vessel forty years ago. Trace the source of the phantom transmission before inland reservoirs answer the call.",
    zone: "North America",
    theme: "LOVECRAFTIAN",
    primaryStat: "Courage",
    skills: ["Psychology", "Linguistics"],
    difficulty: 7,
    lifetimeMinutes: 150, // 2.5 hours
  },
  {
    id: "wt_harvest_rites",
    name: "The Last Harvest Rite",
    description:
      "Satellite imagery of a drought-stricken region shows perfectly green crop circles forming overnight, spelling out equations no mathematician can solve. Locals speak of a 'final harvest' promised by something that lives under the topsoil. Livestock left near the circles are found desiccated, reduced to skin and teeth. Your operatives must descend into the irrigation tunnels and break the pact before the soil decides it prefers human tithes.",
    zone: "Africa",
    theme: "FOLKLORE",
    primaryStat: "Courage",
    skills: ["Geology", "Biology"],
    difficulty: 7,
    lifetimeMinutes: 150,
  },
  {
    id: "wt_ashen_children",
    name: "Ashen Children of the Schoolyard",
    description:
      "A closed-down elementary school on the outskirts of a megacity has become an urban legend destination. Teenagers who break in report playing hide-and-seek with children made of ash, who beg to be remembered. Those who accept the invitation begin losing personal memories at random, starting with birthdays and progressing toward names. Seal the building, catalog the spectral class roster, and lay them to rest before the city forgets itself.",
    zone: "Asia",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",
    skills: ["Psychology", "Stealth"],
    difficulty: 8,
    lifetimeMinutes: DEFAULT_LIFETIME_MINUTES, // 180
  },
  {
    id: "wt_ouroboros_signal",
    name: "The Ouroboros Transmission",
    description:
      "A clandestine numbers station that was decommissioned decades ago has begun broadcasting again, but every recording of the signal is different. Analysts decoding it realize the numbers describe their own biometric data, updated in real time. The final segment of the broadcast is redacted by an unknown hand just before playback. Track the physical transmitter and sever the loop before the message reaches its last line.",
    zone: "Europe",
    theme: "LOVECRAFTIAN",
    primaryStat: "Investigation",
    skills: ["Research", "Linguistics"],
    difficulty: 8,
    lifetimeMinutes: 210, // 3.5 hours – long, analytical
  },
  {
    id: "wt_fungal_cathedral",
    name: "The Fungal Cathedral",
    description:
      "Deep in an uncharted section of rainforest, an impossibly regular spire of fungal growth has erupted from the canopy, forming a 'cathedral' visible from orbit. Spores drifting downwind provoke religious ecstasy followed by catatonia. Satellite shots reveal human silhouettes encased in mycelium, kneeling in rows along the nave. Burn the root network, rescue any salvageable survivors, and prevent the cathedral from 'seeding' new congregations on other continents.",
    zone: "South America",
    theme: "RESIDENT_EVIL",
    primaryStat: "Courage",
    skills: ["Biology", "Firearms"],
    difficulty: 9,
    lifetimeMinutes: 210, // 3.5 hours – tough bio boss
  },
  {
    id: "wt_mirror_network",
    name: "The Mirror Network",
    description:
      "A series of seemingly unrelated urban legends—mirrors that lag behind, reflections that blink out of sync, faces seen staring from darkened office windows at 3:33 a.m.—line up into a pattern when plotted across a telecom provider's fiber network. Something has learned to route itself through reflections, using glass and polished metal as temporary bodies. Trace the pattern, collapse the network nodes, and corner the root reflection before it learns how to look back from every screen on Earth.",
    zone: "North America",
    theme: "JUNJI_ITO",
    primaryStat: "Occultism",
    skills: ["Stealth", "Psychology"],
    difficulty: 9,
    lifetimeMinutes: 210,
  },
  {
    id: "wt_penumbral_census",
    name: "The Penumbral Census",
    description:
      "Governments across multiple jurisdictions have simultaneously launched population verification campaigns that share identical wording and unexplained urgency. Cross-referencing the forms shows that they are not counting citizens, but gaps—people who should exist statistically but do not. The last time such a census was attempted, an entire city vanished from historical records overnight. Infiltrate the data centers running the surveys and sabotage the algorithm before it learns which of your agents are statistically impossible.",
    zone: "Asia",
    theme: "LOVECRAFTIAN",
    primaryStat: "Investigation",
    skills: ["Research", "Psychology"],
    difficulty: 10,
    lifetimeMinutes: 240, // 4 hours – endgame event
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
  DEFAULT_LIFETIME_MINUTES,
  threatTemplates,
  createThreatInstance,
};
