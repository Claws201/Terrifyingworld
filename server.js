// server.js
// World Threat backend with:
// - Difficulty easing: diff 10 = baseline; lower diffs are easier (faster progress + gentler drain)
// - Per-agent worldThreatModifiers (power/health/sanity multipliers)
// - Single active threat + 30 min cooldown after clear/expire
// - Archives finished threats + reward eligibility map
// - Admin endpoints: /world-threats/admin/finish and /world-threats/admin/cycle
// - Back-compat routes: /world-threats/:instanceId/assign|unassign

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  AGENT_HEALTH_LOSS_PER_MINUTE,
  AGENT_SANITY_LOSS_PER_MINUTE,
  COOLDOWN_MINUTES_AFTER_END,
  threatTemplates,
  createThreatInstance,
} = require(path.join(__dirname, "worldThreatConfig"));

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3001;

// Defaults if not provided by config
const WT_BASE_RATE = Number(WORLD_THREAT_BASE_PROGRESS_RATE ?? 0.001); // % per sec per power
const HP_LOSS_PER_MIN = Number(AGENT_HEALTH_LOSS_PER_MINUTE ?? 1);     // hp/min
const SAN_LOSS_PER_MIN = Number(AGENT_SANITY_LOSS_PER_MINUTE ?? 2);    // san/min
const COOLDOWN_MIN = Number(COOLDOWN_MINUTES_AFTER_END ?? 30);

// In-memory state
let activeThreat = null;               // current active threat
let finishedThreats = [];              // archive (cleared/expired)
let lastTickMs = Date.now();
let cooldownUntilMs = 0;               // timestamp when next spawn allowed

// Helpers
function rngPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Difficulty easing:
 * 10 -> 1.0x (no change)
 * <10 -> faster progress & gentler drain
 * EASY_SCALAR controls how much faster at low difficulties.
 */
function getDifficultySpeed(threat) {
  const d = Math.max(1, Math.min(10, Number(threat.difficulty) || 10));
  const EASY_SCALAR = 0.10; // diff 1 => 1 + (9 * 0.10) = 1.9x
  return 1 + (10 - d) * EASY_SCALAR;
}

/** Compute one agent’s contribution ("power") */
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

  // Optional specialization multiplier from client
  const wtMods = agent.worldThreatModifiers || {};
  const powerMult =
    typeof wtMods.powerMultiplier === "number" ? wtMods.powerMultiplier : 1;

  basePower *= powerMult;
  return Math.max(0, basePower);
}

/** Spawn a new threat from templates */
function spawnThreat() {
  const tmpl = rngPick(threatTemplates);
  const inst = createThreatInstance(tmpl);
  activeThreat = inst;
  lastTickMs = Date.now();
}

/** Build reward eligibility (players who had agents assigned) */
function buildEligibilityMap(threat) {
  const map = {};
  (threat.assignedAgents || []).forEach((a) => {
    if (!a || !a.playerId) return;
    map[a.playerId] = true;
  });
  return map;
}

/** End active threat: mark status & archive, start cooldown */
function endActiveThreat(status) {
  if (!activeThreat) return;
  const ended = {
    ...activeThreat,
    status,
    eligibleForRewardByPlayerId: buildEligibilityMap(activeThreat),
    endedAt: new Date().toISOString(),
  };
  finishedThreats.unshift(ended);
  activeThreat = null;
  cooldownUntilMs = Date.now() + COOLDOWN_MIN * 60 * 1000;
  // trim archive to last 50
  if (finishedThreats.length > 50) {
    finishedThreats = finishedThreats.slice(0, 50);
  }
}

/** Main tick loop */
function tickThreats() {
  const now = Date.now();
  const elapsedSec = (now - lastTickMs) / 1000;
  if (elapsedSec <= 0) return;
  lastTickMs = now;

  // No active threat: auto-spawn when cooldown passed
  if (!activeThreat) {
    if (now >= cooldownUntilMs) {
      spawnThreat();
    }
    return;
  }

  const t = activeThreat;

  // Expiry
  const expTs = new Date(t.expiresAt).getTime();
  if (now >= expTs && t.status === "active") {
    activeThreat.status = "expired";
    endActiveThreat("expired");
    return;
  }
  if (t.status !== "active") return;

  // Drain & power
  let totalPower = 0;
  const difficultySpeed = getDifficultySpeed(t);
  const difficultyDrainFactor = 1 / difficultySpeed;

  activeThreat.assignedAgents = (activeThreat.assignedAgents || [])
    .map((bundle) => {
      const updated = [];
      for (const agent of bundle.agents) {
        const mods = agent.worldThreatModifiers || {};
        const healthMult =
          typeof mods.healthLossMultiplier === "number"
            ? mods.healthLossMultiplier
            : 1;
        const sanityMult =
          typeof mods.sanityLossMultiplier === "number"
            ? mods.sanityLossMultiplier
            : 1;

        const baseHp = (HP_LOSS_PER_MIN * elapsedSec) / 60;
        const baseSan = (SAN_LOSS_PER_MIN * elapsedSec) / 60;

        const hpLoss = baseHp * difficultyDrainFactor * healthMult;
        const sanLoss = baseSan * difficultyDrainFactor * sanityMult;

        let newHealth = (agent.health ?? 0) - hpLoss;
        let newSanity = (agent.sanity ?? 0) - sanLoss;

        if (newHealth <= 0 || newSanity <= 0) {
          // downed/broken: drop from list
          continue;
        }

        const live = { ...agent, health: newHealth, sanity: newSanity };
        totalPower += computeAgentPower(live, t);
        updated.push(live);
      }
      return { ...bundle, agents: updated };
    })
    .filter((b) => b.agents && b.agents.length > 0);

  // Progress
  const progressDelta = elapsedSec * totalPower * WT_BASE_RATE * difficultySpeed;
  activeThreat.progress = Math.min(100, (activeThreat.progress || 0) + progressDelta);
  activeThreat.lastTick = new Date().toISOString();

  // Cleared
  if (activeThreat.progress >= 100) {
    activeThreat.status = "cleared";
    endActiveThreat("cleared");
  }
}

setInterval(tickThreats, 1000);

// --------- API ---------

// Health check
app.get("/", (_req, res) => {
  res.send("World Threat server online");
});

// List: active first, then archives (newest first)
app.get("/world-threats", (_req, res) => {
  function decorate(t) {
    const now = Date.now();
    const expTs = new Date(t.expiresAt).getTime();
    const secondsToExpiry = Math.max(0, Math.floor((expTs - now) / 1000));

    let etaSecondsToCompletion = null;
    let etaCompletionAt = null;

    if (t.status === "active") {
      let totalPower = 0;
      (t.assignedAgents || []).forEach((b) =>
        (b.agents || []).forEach((a) => {
          totalPower += computeAgentPower(a, t);
        })
      );
      const diffSpeed = getDifficultySpeed(t);
      const perSec = totalPower * WT_BASE_RATE * diffSpeed;
      if (perSec > 0 && t.progress < 100) {
        etaSecondsToCompletion = (100 - t.progress) / perSec;
        etaCompletionAt = new Date(now + etaSecondsToCompletion * 1000).toISOString();
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
  finishedThreats.forEach((ft) => list.push(decorate(ft)));

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Assign: up to 3 agents per player (instance-less endpoint)
app.post("/world-threats/assign", (req, res) => {
  const { playerId, directorName, agents } = req.body || {};
  if (!activeThreat || activeThreat.status !== "active") {
    return res.status(400).json({ error: "No active threat to assign to." });
  }
  if (!playerId || !directorName || !Array.isArray(agents)) {
    return res.status(400).json({ error: "Missing playerId, directorName, or agents." });
  }

  const limited = agents.slice(0, 3);
  const snapshots = limited.map((a) => ({
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
    worldThreatModifiers: a.worldThreatModifiers || {}, // power/health/sanity multipliers
  }));

  const bundles = activeThreat.assignedAgents || [];
  const idx = bundles.findIndex((b) => b.playerId === playerId);
  const bundle = { playerId, directorName, agents: snapshots };
  if (idx >= 0) bundles[idx] = bundle;
  else bundles.push(bundle);
  activeThreat.assignedAgents = bundles;

  res.json({ ok: true });
});

// Unassign (instance-less endpoint)
app.post("/world-threats/unassign", (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: "Missing playerId" });
  if (!activeThreat) return res.json({ ok: true });
  activeThreat.assignedAgents = (activeThreat.assignedAgents || []).filter(
    (b) => b.playerId !== playerId
  );
  res.json({ ok: true });
});

// ---------- Back-compat routes (instanceId in path) ----------

// Assign with instanceId in path
app.post("/world-threats/:instanceId/assign", (req, res) => {
  const { instanceId } = req.params;
  if (!activeThreat || activeThreat.status !== "active") {
    return res.status(400).json({ error: "No active threat to assign to." });
  }
  if (activeThreat.instanceId !== instanceId) {
    return res.status(404).json({ error: "Threat not found or not active." });
  }
  const { playerId, directorName, agents } = req.body || {};
  if (!playerId || !directorName || !Array.isArray(agents)) {
    return res.status(400).json({ error: "Missing playerId, directorName, or agents." });
  }

  const limited = agents.slice(0, 3);
  const snapshots = limited.map((a) => ({
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
    worldThreatModifiers: a.worldThreatModifiers || {},
  }));

  const bundles = activeThreat.assignedAgents || [];
  const idx = bundles.findIndex((b) => b.playerId === playerId);
  const bundle = { playerId, directorName, agents: snapshots };
  if (idx >= 0) bundles[idx] = bundle; else bundles.push(bundle);
  activeThreat.assignedAgents = bundles;

  return res.json({ ok: true });
});

// Unassign with instanceId in path
app.post("/world-threats/:instanceId/unassign", (req, res) => {
  const { instanceId } = req.params;
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: "Missing playerId" });
  if (!activeThreat || activeThreat.instanceId !== instanceId) {
    return res.status(404).json({ error: "Threat not found or not active." });
  }
  activeThreat.assignedAgents = (activeThreat.assignedAgents || []).filter(
    (b) => b.playerId !== playerId
  );
  return res.json({ ok: true });
});

// ---------------- Admin endpoints ----------------

// Instantly clear current threat
app.post("/world-threats/admin/finish", (_req, res) => {
  if (!activeThreat) return res.status(400).json({ error: "No active threat." });
  activeThreat.progress = 100;
  activeThreat.status = "cleared";
  endActiveThreat("cleared");
  res.json({ ok: true });
});

// Cycle (expire current if any, then spawn new now; ignores cooldown)
app.post("/world-threats/admin/cycle", (_req, res) => {
  if (activeThreat) {
    activeThreat.status = "expired";
    endActiveThreat("expired");
  }
  cooldownUntilMs = 0;
  spawnThreat();
  res.json({ ok: true, instanceId: activeThreat.instanceId });
});

app.listen(PORT, () => {
  console.log(`World Threat server listening on port ${PORT}`);
});
