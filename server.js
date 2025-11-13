// server.js
// Minimal world-threat backend with difficulty easing (<10 easier), WT modifiers, single-active model, and admin cycle.
// Run: node server.js   (PORT env optional)

const express = require("express");
const cors = require("cors");
const {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  AGENT_HEALTH_LOSS_PER_MINUTE,      // add these to your worldThreatConfig.js if not present
  AGENT_SANITY_LOSS_PER_MINUTE,      // (defaults below kick in if undefined)
  threatTemplates,
  createThreatInstance,
} = require("./backend/worldThreatConfig");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;

// --- Fallback defaults if not exported from config ---
const WT_BASE_RATE = Number(WORLD_THREAT_BASE_PROGRESS_RATE ?? 0.001); // % per sec per power
const HP_LOSS_PER_MIN = Number(AGENT_HEALTH_LOSS_PER_MINUTE ?? 1);     // hp/min
const SAN_LOSS_PER_MIN = Number(AGENT_SANITY_LOSS_PER_MINUTE ?? 2);    // san/min (your last request)
const COOLDOWN_MINUTES_AFTER_END = 30;

// --- In-memory state ---
let activeThreat = null;               // the single active threat (or null)
let finishedThreats = [];              // archive list for clients to read
let lastTickMs = Date.now();
let cooldownUntilMs = 0;               // timestamp when we’re allowed to spawn next

// --- Helpers ---
function rngPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Difficulty easing:
 * 10 => speed 1.0 (no change)
 * <10 => faster progress, gentler drain
 * EASY_SCALAR controls how much faster at low difficulties.
 */
function getDifficultySpeed(threat) {
  const d = Math.max(1, Math.min(10, Number(threat.difficulty) || 10));
  const EASY_SCALAR = 0.10; // tune: diff 1 => 1 + (9 * 0.10) = 1.9x
  return 1 + (10 - d) * EASY_SCALAR;
}

/** Compute one agent’s power vs a given threat. */
function computeAgentPower(agent, threat) {
  const c = agent.courage || 0;
  const i = agent.investigation || 0;
  const o = agent.occultism || 0;

  let primary = o;
  if (threat.primaryStat === "Courage") primary = c;
  else if (threat.primaryStat === "Investigation") primary = i;

  const statSum = c + i + o;

  let skillBonus = 0;
  const need = Array.isArray(threat.skills) ? threat.skills : [];
  const have = new Set(Array.isArray(agent.skills) ? agent.skills : []);
  for (const s of need) if (have.has(s)) skillBonus += 2;

  let basePower = primary * 1.5 + statSum * 0.6 + skillBonus;

  // SPECIALIZATIONS (client-provided)
  const wtMods = agent.worldThreatModifiers || {};
  const powerMult = typeof wtMods.powerMultiplier === "number" ? wtMods.powerMultiplier : 1;

  basePower *= powerMult;
  return Math.max(0, basePower);
}

/** Spawn a new threat (random template). */
function spawnThreat() {
  const tmpl = rngPick(threatTemplates);
  const inst = createThreatInstance(tmpl);
  activeThreat = inst;
  lastTickMs = Date.now();
}

/** Mark the active threat ended (status = cleared or expired) and start cooldown. */
function endActiveThreat(status) {
  if (!activeThreat) return;

  const ended = {
    ...activeThreat,
    status,
    // reward flag map so frontend can show claim UI for participants
    eligibleForRewardByPlayerId: buildEligibilityMap(activeThreat),
    endedAt: new Date().toISOString(),
  };
  finishedThreats.unshift(ended);
  activeThreat = null;

  // 30-minute cooldown
  cooldownUntilMs = Date.now() + COOLDOWN_MINUTES_AFTER_END * 60 * 1000;
}

/** Build participant reward eligibility (by playerId). */
function buildEligibilityMap(threat) {
  const map = {};
  (threat.assignedAgents || []).forEach(a => {
    if (!a || !a.playerId) return;
    map[a.playerId] = true;
  });
  return map;
}

/** Housekeeping for archives: trim to last N */
function trimFinished(max = 50) {
  if (finishedThreats.length > max) {
    finishedThreats = finishedThreats.slice(0, max);
  }
}

/** Main ticking loop */
function tickThreats() {
  const now = Date.now();
  const elapsedSec = (now - lastTickMs) / 1000;
  if (elapsedSec <= 0) return;
  lastTickMs = now;

  // If no active threat, consider cooldown / auto-spawn
  if (!activeThreat) {
    if (now >= cooldownUntilMs) {
      // no cooldown => can spawn automatically if you want auto-flow
      // comment out next line if you only want admin/manual spawn
      spawnThreat();
    }
    return;
  }

  const threat = activeThreat;

  // Expiry check
  const expiresTs = new Date(threat.expiresAt).getTime();
  if (now >= expiresTs && threat.status === "active") {
    activeThreat.status = "expired";
    endActiveThreat("expired");
    trimFinished();
    return;
  }

  if (threat.status !== "active") return;

  // Health/sanity drain + power accumulation
  let totalPower = 0;
  const difficultySpeed = getDifficultySpeed(threat);
  const difficultyDrainFactor = 1 / difficultySpeed;

  // For each director assignment bundle
  activeThreat.assignedAgents = (activeThreat.assignedAgents || []).map(assign => {
    const updatedAgents = [];

    for (const agent of assign.agents) {
      const mods = agent.worldThreatModifiers || {};
      const healthMult = typeof mods.healthLossMultiplier === "number" ? mods.healthLossMultiplier : 1;
      const sanityMult = typeof mods.sanityLossMultiplier === "number" ? mods.sanityLossMultiplier : 1;

      const baseHp = (HP_LOSS_PER_MIN * elapsedSec) / 60;
      const baseSan = (SAN_LOSS_PER_MIN * elapsedSec) / 60;

      const hpLoss = baseHp * difficultyDrainFactor * healthMult;
      const sanLoss = baseSan * difficultyDrainFactor * sanityMult;

      let newHealth = (agent.health ?? 0) - hpLoss;
      let newSanity = (agent.sanity ?? 0) - sanLoss;

      if (newHealth <= 0 || newSanity <= 0) {
        // Agent is removed (downed/broken)
        continue;
      }

      const live = { ...agent, health: newHealth, sanity: newSanity };
      totalPower += computeAgentPower(live, threat);
      updatedAgents.push(live);
    }

    return { ...assign, agents: updatedAgents };
  })
  // drop empty director bundles
  .filter(assign => (assign.agents && assign.agents.length > 0));

  // Apply progress
  const progressDelta = elapsedSec * totalPower * WT_BASE_RATE * difficultySpeed;
  activeThreat.progress = Math.min(100, (activeThreat.progress || 0) + progressDelta);
  activeThreat.lastTick = new Date().toISOString();

  // If cleared
  if (activeThreat.progress >= 100) {
    activeThreat.status = "cleared";
    endActiveThreat("cleared");
    trimFinished();
  }
}

// --- Ticker every second ---
setInterval(tickThreats, 1000);

// --- REST API ---

// Get list for clients
app.get("/world-threats", (_req, res) => {
  // seconds to expiry & ETA
  function decorate(t) {
    const now = Date.now();
    const expiresTs = new Date(t.expiresAt).getTime();
    const secondsToExpiry = Math.max(0, Math.floor((expiresTs - now) / 1000));

    let etaSecondsToCompletion = null;
    let etaCompletionAt = null;

    if (t.status === "active") {
      // recalc total power snapshot for a best-effort ETA (approx)
      let totalPower = 0;
      (t.assignedAgents || []).forEach(a => {
        (a.agents || []).forEach(agent => {
          totalPower += computeAgentPower(agent, t);
        });
      });

      const difficultySpeed = getDifficultySpeed(t);
      const perSecondGain = totalPower * WT_BASE_RATE * difficultySpeed;

      if (perSecondGain > 0 && t.progress < 100) {
        etaSecondsToCompletion = (100 - t.progress) / perSecondGain;
        etaCompletionAt = new Date(Date.now() + etaSecondsToCompletion * 1000).toISOString();
      }
    }

    return {
      ...t,
      secondsToExpiry,
      etaSecondsToCompletion,
      etaCompletionAt,
    };
  }

  const list = [];
  if (activeThreat) list.push(decorate(activeThreat));
  // Keep archives visible
  list.push(...finishedThreats.map(decorate));

  // newest first
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Assign up to 3 agents per player to the active threat
app.post("/world-threats/assign", (req, res) => {
  const { playerId, directorName, agents } = req.body || {};
  if (!activeThreat || activeThreat.status !== "active") {
    return res.status(400).json({ error: "No active threat to assign to." });
  }
  if (!playerId || !directorName || !Array.isArray(agents)) {
    return res.status(400).json({ error: "Missing playerId, directorName, or agents." });
  }

  // Enforce max 3 agents per player
  const limited = agents.slice(0, 3);

  const snapshots = limited.map(a => ({
    agentId: a.agentId,
    name: a.name,
    portraitUrl: a.portraitUrl,
    courage: a.courage || 0,
    investigation: a.investigation || 0,
    occultism: a.occultism || 0,
    health: a.health ?? 30,
    sanity: a.sanity ?? 30,
    skills: Array.isArray(a.skills) ? a.skills : [],
    statModifiers: a.statModifiers || {},
    worldThreatModifiers: a.worldThreatModifiers || {}, // << important
  }));

  // replace or add assignment bundle for this player
  const bundles = activeThreat.assignedAgents || [];
  const idx = bundles.findIndex(b => b.playerId === playerId);
  const bundle = { playerId, directorName, agents: snapshots };

  if (idx >= 0) bundles[idx] = bundle;
  else bundles.push(bundle);

  activeThreat.assignedAgents = bundles;
  res.json({ ok: true });
});

// Unassign a player's agents
app.post("/world-threats/unassign", (req, res) => {
  const { playerId } = req.body || {};
  if (!activeThreat) return res.json({ ok: true });
  if (!playerId) return res.status(400).json({ error: "Missing playerId" });

  activeThreat.assignedAgents = (activeThreat.assignedAgents || []).filter(b => b.playerId !== playerId);
  res.json({ ok: true });
});

// Admin: instantly clear current threat
app.post("/world-threats/admin/finish", (_req, res) => {
  if (!activeThreat) return res.status(400).json({ error: "No active threat." });
  activeThreat.progress = 100;
  activeThreat.status = "cleared";
  endActiveThreat("cleared");
  trimFinished();
  res.json({ ok: true });
});

// Admin: cycle immediately (expire current if any, then spawn fresh; ignores cooldown)
app.post("/world-threats/admin/cycle", (_req, res) => {
  if (activeThreat) {
    activeThreat.status = "expired";
    endActiveThreat("expired");
    trimFinished();
  }
  cooldownUntilMs = 0; // ignore cooldown for this action
  spawnThreat();
  res.json({ ok: true, instanceId: activeThreat.instanceId });
});

// Health check
app.get("/", (_req, res) => {
  res.send("World Threat server online");
});

app.listen(PORT, () => {
  console.log(`World Threat server listening on port ${PORT}`);
});
