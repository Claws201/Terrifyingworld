// server.js
// World Threat backend with:
// - Difficulty scaling (diff 10 = baseline; lower diffs are easier: faster progress + gentler drain)
// - Per-agent worldThreatModifiers (power/health/sanity multipliers)
// - Single active threat + 30 min cooldown after clear/expire
// - Archives with reward eligibility
// - Contribution tracking (power-seconds) + heatmap endpoints
// - Admin endpoints: /world-threats/admin/finish and /world-threats/admin/cycle
// - Back-compat routes: /world-threats/:instanceId/assign|unassign
// - Full input sanitization + NaN guards

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

// ----------------- Helpers & Sanitizers -----------------
function rngPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.map((s) => (typeof s === "string" ? s : String(s))).filter(Boolean);
}

function sanitizeAgentSnapshot(a) {
  return {
    agentId: String(a?.agentId || ""),
    name: String(a?.name || "Unknown"),
    portraitUrl: a?.portraitUrl ? String(a.portraitUrl) : "",
    courage: toNum(a?.courage, 0),
    investigation: toNum(a?.investigation, 0),
    occultism: toNum(a?.occultism, 0),
    health: toNum(a?.health, 30),
    sanity: toNum(a?.sanity, 30),
    skills: sanitizeSkills(a?.skills),
    statModifiers: (a && typeof a.statModifiers === "object" && a.statModifiers) || {},
    worldThreatModifiers:
      (a && typeof a.worldThreatModifiers === "object" && a.worldThreatModifiers) || {},
  };
}

/**
 * Difficulty easing:
 * 10 -> 1.0x (no change)
 * <10 -> faster progress & gentler drain
 * EASY_SCALAR controls how much faster at low difficulties.
 */
function getDifficultySpeed(threat) {
  const d = Math.max(1, Math.min(10, Number(threat?.difficulty) || 10));
  const EASY_SCALAR = 0.10; // diff 1 => 1 + (9 * 0.10) = 1.9x
  return 1 + (10 - d) * EASY_SCALAR;
}

/** Compute one agent’s contribution ("power") with NaN guards */
function computeAgentPower(agent, threat) {
  const c = toNum(agent?.courage, 0);
  const i = toNum(agent?.investigation, 0);
  const o = toNum(agent?.occultism, 0);

  let primary = o;
  const ps = String(threat?.primaryStat || "");
  if (ps === "Courage") primary = c;
  else if (ps === "Investigation") primary = i;

  const statSum = c + i + o;

  let skillBonus = 0;
  const need = Array.isArray(threat?.skills) ? threat.skills : [];
  const have = new Set(Array.isArray(agent?.skills) ? agent.skills : []);
  for (const s of need) if (have.has(s)) skillBonus += 2;

  let basePower = primary * 1.5 + statSum * 0.6 + skillBonus;

  const wtMods = agent?.worldThreatModifiers || {};
  const powerMult = toNum(wtMods.powerMultiplier, 1);
  basePower *= powerMult;

  if (!Number.isFinite(basePower) || basePower < 0) basePower = 0;
  return basePower;
}

// Round a timestamp down to the start of its minute
function minuteBucket(tsMs) {
  return Math.floor(tsMs / 60000) * 60000;
}

function decorateThreat(t) {
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

  // Small summary of contributions (optional UI helper)
  const contributionsSummary = t.contributions
    ? {
        playerCount: Object.keys(t.contributions.totals || {}).length,
        topPlayers: Object.entries(t.contributions.totals || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([playerId, total]) => ({ playerId, total })),
      }
    : null;

  return {
    ...t,
    secondsToExpiry,
    etaSecondsToCompletion,
    etaCompletionAt,
    contributionsSummary,
  };
}

// ----------------- Threat lifecycle -----------------
function spawnThreat() {
  const tmpl = rngPick(threatTemplates);
  const inst = createThreatInstance(tmpl);
  // init contribution tracking
  inst.contributions = { totals: {}, buckets: {} };
  activeThreat = inst;
  lastTickMs = Date.now();
}

function buildEligibilityMap(threat) {
  const map = {};
  (threat.assignedAgents || []).forEach((a) => {
    if (!a || !a.playerId) return;
    map[a.playerId] = true;
  });
  return map;
}

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
  if (finishedThreats.length > 50) {
    finishedThreats = finishedThreats.slice(0, 50);
  }
}

// ----------------- Main tick -----------------
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

  const contribNowBucketIso = new Date(minuteBucket(now)).toISOString();
  const KEEP_MS = 6 * 60 * 60 * 1000; // keep last 6h of minute buckets
  const cutoff = now - KEEP_MS;

  activeThreat.assignedAgents = (activeThreat.assignedAgents || [])
    .map((bundle) => {
      const updated = [];
      let bundlePower = 0;

      for (const agent of bundle.agents) {
        const mods = agent?.worldThreatModifiers || {};
        const healthMult = toNum(mods.healthLossMultiplier, 1);
        const sanityMult = toNum(mods.sanityLossMultiplier, 1);

        const baseHp = (HP_LOSS_PER_MIN * elapsedSec) / 60;
        const baseSan = (SAN_LOSS_PER_MIN * elapsedSec) / 60;

        // Harder difficulty => more drain (inverse of speed)
        const hpLoss = baseHp * difficultyDrainFactor * healthMult;
        const sanLoss = baseSan * difficultyDrainFactor * sanityMult;

        let newHealth = toNum(agent?.health, 30) - hpLoss;
        let newSanity = toNum(agent?.sanity, 30) - sanLoss;

        if (newHealth <= 0 || newSanity <= 0) {
          // downed/broken: drop from list
          continue;
        }

        const live = { ...agent, health: newHealth, sanity: newSanity };
        const p = computeAgentPower(live, t);
        bundlePower += p;
        updated.push(live);
      }

      // Record contribution for this player (power-seconds)
      if (!activeThreat.contributions) {
        activeThreat.contributions = { totals: {}, buckets: {} };
      }
      const pid = String(bundle.playerId || "unknown");
      const contrib = bundlePower * elapsedSec;

      activeThreat.contributions.totals[pid] =
        (activeThreat.contributions.totals[pid] || 0) + contrib;

      if (!activeThreat.contributions.buckets[pid]) {
        activeThreat.contributions.buckets[pid] = {};
      }
      activeThreat.contributions.buckets[pid][contribNowBucketIso] =
        (activeThreat.contributions.buckets[pid][contribNowBucketIso] || 0) + contrib;

      // prune old minute buckets to bound memory
      const byMinute = activeThreat.contributions.buckets[pid];
      for (const k of Object.keys(byMinute)) {
        if (new Date(k).getTime() < cutoff) delete byMinute[k];
      }

      totalPower += bundlePower;
      return { ...bundle, agents: updated };
    })
    .filter((b) => b.agents && b.agents.length > 0);

  // Progress (easier difficulty => faster)
  const progressDelta = elapsedSec * totalPower * WT_BASE_RATE * difficultySpeed;
  const nextProgress = toNum(t.progress, 0) + progressDelta;
  activeThreat.progress = Math.min(100, nextProgress);
  activeThreat.lastTick = new Date().toISOString();

  // Cleared
  if (activeThreat.progress >= 100) {
    activeThreat.status = "cleared";
    endActiveThreat("cleared");
  }
}

setInterval(tickThreats, 1000);

// ----------------- API -----------------
// Health check
app.get("/", (_req, res) => {
  res.send("World Threat server online");
});

// List: active first, then archives (newest first)
app.get("/world-threats", (_req, res) => {
  const list = [];
  if (activeThreat) list.push(decorateThreat(activeThreat));
  finishedThreats.forEach((ft) => list.push(decorateThreat(ft)));
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

  const limited = agents.slice(0, 3).map(sanitizeAgentSnapshot);

  const bundles = activeThreat.assignedAgents || [];
  const idx = bundles.findIndex((b) => b.playerId === playerId);
  const bundle = { playerId: String(playerId), directorName: String(directorName), agents: limited };
  if (idx >= 0) bundles[idx] = bundle; else bundles.push(bundle);
  activeThreat.assignedAgents = bundles;

  return res.json(decorateThreat(activeThreat));
});

// Unassign (instance-less endpoint)
app.post("/world-threats/unassign", (req, res) => {
  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: "Missing playerId" });
  if (!activeThreat) return res.json({ ok: true });
  activeThreat.assignedAgents = (activeThreat.assignedAgents || []).filter(
    (b) => b.playerId !== playerId
  );
  return res.json(decorateThreat(activeThreat));
});

// ---------- Back-compat routes (instanceId in path) ----------
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

  const limited = agents.slice(0, 3).map(sanitizeAgentSnapshot);

  const bundles = activeThreat.assignedAgents || [];
  const idx = bundles.findIndex((b) => b.playerId === playerId);
  const bundle = { playerId: String(playerId), directorName: String(directorName), agents: limited };
  if (idx >= 0) bundles[idx] = bundle; else bundles.push(bundle);
  activeThreat.assignedAgents = bundles;

  return res.json(decorateThreat(activeThreat));
});

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
  return res.json(decorateThreat(activeThreat));
});

// ---------------- Contribution endpoints ----------------
app.get("/world-threats/contributions/current", (_req, res) => {
  if (!activeThreat || !activeThreat.contributions) {
    return res.json({
      instanceId: activeThreat?.instanceId || null,
      totals: {},
      buckets: {},
    });
  }
  res.json({
    instanceId: activeThreat.instanceId,
    totals: activeThreat.contributions.totals,
    buckets: activeThreat.contributions.buckets,
  });
});

app.get("/world-threats/:instanceId/contributions", (req, res) => {
  const { instanceId } = req.params;
  const src =
    (activeThreat && activeThreat.instanceId === instanceId) ? activeThreat :
    finishedThreats.find((t) => t.instanceId === instanceId);
  if (!src || !src.contributions) {
    return res.status(404).json({ error: "No contributions for that instance." });
  }
  return res.json({
    instanceId: src.instanceId,
    totals: src.contributions.totals,
    buckets: src.contributions.buckets,
  });
});

// ---------------- Admin endpoints ----------------
app.post("/world-threats/admin/finish", (_req, res) => {
  if (!activeThreat) return res.status(400).json({ error: "No active threat." });
  activeThreat.progress = 100;
  activeThreat.status = "cleared";
  endActiveThreat("cleared");
  res.json({ ok: true });
});

app.post("/world-threats/admin/cycle", (_req, res) => {
  if (activeThreat) {
    activeThreat.status = "expired";
    endActiveThreat("expired");
  }
  cooldownUntilMs = 0; // ignore cooldown for this action
  spawnThreat();
  res.json({ ok: true, instanceId: activeThreat.instanceId });
});

app.listen(PORT, () => {
  console.log(`World Threat server listening on port ${PORT}`);
});
