// backend/server.js
const express = require("express");
const cors = require("cors");
const {
  WORLD_THREAT_BASE_PROGRESS_RATE,
  threatTemplates,
  createThreatInstance,
} = require("./worldThreatConfig");

const app = express();
app.use(cors());
app.use(express.json());

// ===== IN-MEMORY STATE =====

let activeThreats = [];
// When the last threat was CLEARED or EXPIRED.
// Used to enforce a 30-minute wait before spawning the next one.
let lastThreatEndAt = null;

// Config – tweak as you like
const MAX_ACTIVE_THREATS = 1;       // only 1 active threat at a time
const SPAWN_INTERVAL_MINUTES = 30;  // wait 30 minutes after a threat ends

// ===== HELPER FUNCTIONS =====

function getRandomTemplate() {
  const index = Math.floor(Math.random() * threatTemplates.length);
  return threatTemplates[index];
}

function findThreat(instanceId) {
  return activeThreats.find((t) => t.instanceId === instanceId);
}

// Agent snapshot shape:
//
// {
//   agentId,
//   name,
//   courage,
//   investigation,
//   occultism,
//   health,   // current health
//   sanity,   // current sanity
//   skills: string[],
//   statModifiers: { courage, investigation, occultism }
// }
function calculateAgentPower(agent, threat) {
  const primary = threat.primaryStat; // "Courage" | "Investigation" | "Occultism"
  const key = primary.toLowerCase();  // "courage" / "investigation" / "occultism"

  const baseStat = agent[key] || 0;
  const modifier = agent.statModifiers?.[key] || 0;
  const totalStat = baseStat + modifier;

  const hasSkillMatch =
    Array.isArray(threat.skills) &&
    Array.isArray(agent.skills) &&
    agent.skills.some((s) => threat.skills.includes(s));

  const skillMatchBonus = hasSkillMatch ? 1.2 : 1;
  return totalStat * skillMatchBonus;
}

function calculateTotalPower(threat) {
  let total = 0;
  for (const assignment of threat.assignedAgents) {
    for (const agent of assignment.agents) {
      total += calculateAgentPower(agent, threat);
    }
  }
  return total;
}

function tickThreat(threat) {
  if (threat.status !== "active") return threat;

  const now = new Date();
  const last = new Date(threat.lastTick);
  const elapsedSeconds = (now - last) / 1000;

  // Check expiry
  if (threat.expiresAt) {
    const exp = new Date(threat.expiresAt);
    if (now >= exp && threat.status === "active") {
      threat.status = "expired";
      threat.assignedAgents = [];
      threat.lastTick = now.toISOString();
      // mark when this threat ended, so we can enforce a cooldown
      lastThreatEndAt = now.toISOString();
      return threat;
    }
  }

  if (elapsedSeconds <= 0) return threat;

  // --- Health & sanity drain: 1 point per minute ---
  // 1 per minute = 1/60 per second
  const damagePerSecond = 1 / 60;
  const damageAmount = elapsedSeconds * damagePerSecond;

  if (damageAmount > 0) {
    for (const assignment of threat.assignedAgents) {
      for (const agent of assignment.agents) {
        if (typeof agent.health === "number") {
          agent.health = Math.max(0, agent.health - damageAmount);
        }
        if (typeof agent.sanity === "number") {
          agent.sanity = Math.max(0, agent.sanity - damageAmount);
        }
      }
    }
  }
  // --- End health & sanity drain ---

  // Remove agents whose HP or SAN has dropped to 0
  for (const assignment of threat.assignedAgents) {
    assignment.agents = assignment.agents.filter(
      (agent) =>
        (typeof agent.health !== "number" || agent.health > 0) &&
        (typeof agent.sanity !== "number" || agent.sanity > 0)
    );
  }
  // Remove assignments that now have no agents left
  threat.assignedAgents = threat.assignedAgents.filter(
    (assignment) => assignment.agents.length > 0
  );

  const totalPower = calculateTotalPower(threat);
  if (totalPower <= 0) {
    threat.lastTick = now.toISOString();
    return threat;
  }

  const progressDelta =
    elapsedSeconds * totalPower * WORLD_THREAT_BASE_PROGRESS_RATE;

  if (progressDelta > 0) {
    threat.progress = Math.min(100, threat.progress + progressDelta);
    threat.lastTick = now.toISOString();

    if (threat.progress >= 100) {
      threat.status = "cleared";
      // IMPORTANT: keep assignedAgents so the frontend
      // can see who contributed and give rewards.
      // threat.assignedAgents stays as-is.

      // threat successfully cleared – start cooldown from now
      lastThreatEndAt = now.toISOString();
    }
  }

  return threat;
}

function tickAllThreats() {
  activeThreats = activeThreats.map((t) => tickThreat(t));
}

function spawnThreatIfNeeded() {
  const now = new Date();
  const activeCount = activeThreats.filter((t) => t.status === "active").length;

  // Only 1 active threat at a time
  if (activeCount >= MAX_ACTIVE_THREATS) return;

  // If we've had a threat end, enforce a 30-minute cooldown
  if (lastThreatEndAt) {
    const elapsedMinutes = (now - new Date(lastThreatEndAt)) / 60000;
    if (elapsedMinutes < SPAWN_INTERVAL_MINUTES) {
      return; // still cooling down
    }
  }

  // Either this is the first threat ever,
  // or the cooldown has expired – spawn a new one.
  const template = getRandomTemplate();
  const instance = createThreatInstance(template);
  activeThreats.push(instance);

  console.log("Spawned world threat:", instance.name, instance.instanceId);
}

function computeEta(threat) {
  const now = new Date();
  const totalPower = calculateTotalPower(threat);

  let etaSecondsToCompletion = null;
  let etaCompletionAt = null;

  if (threat.status === "active" && totalPower > 0 && threat.progress < 100) {
    const remainingPercent = 100 - threat.progress;
    const progressPerSecond =
      totalPower * WORLD_THREAT_BASE_PROGRESS_RATE;

    if (progressPerSecond > 0) {
      etaSecondsToCompletion = remainingPercent / progressPerSecond;
      const etaDate = new Date(
        now.getTime() + etaSecondsToCompletion * 1000
      );
      etaCompletionAt = etaDate.toISOString();
    }
  }

  let secondsToExpiry = null;
  if (threat.expiresAt && threat.status === "active") {
    const exp = new Date(threat.expiresAt);
    if (exp > now) {
      secondsToExpiry = (exp - now) / 1000;
    } else {
      secondsToExpiry = 0;
    }
  }

  return { etaSecondsToCompletion, etaCompletionAt, secondsToExpiry };
}

function threatWithEta(threat) {
  const eta = computeEta(threat);
  return {
    ...threat,
    ...eta,
  };
}

// ===== ROUTES =====

// Simple check
app.get("/", (req, res) => {
  res.send("World Threat server is running");
});

// List all current threats
app.get("/world-threats", (req, res) => {
  spawnThreatIfNeeded();
  tickAllThreats();
  const result = activeThreats.map(threatWithEta);
  res.json(result);
});

// Get single threat
app.get("/world-threats/:instanceId", (req, res) => {
  spawnThreatIfNeeded();
  tickAllThreats();

  const threat = findThreat(req.params.instanceId);
  if (!threat) return res.status(404).json({ error: "Not found" });

  res.json(threatWithEta(threat));
});

/**
 * Assign agents to a threat.
 *
 * Body:
 * {
 *   "playerId": "player-123",
 *   "directorName": "Director Alice",
 *   "agents": [ AgentSnapshot, ... ]  // max 3
 * }
 */
app.post("/world-threats/:instanceId/assign", (req, res) => {
  const threat = findThreat(req.params.instanceId);
  if (!threat) return res.status(404).json({ error: "Not found" });
  if (threat.status !== "active") {
    return res.status(400).json({ error: "Threat not active" });
  }

  const { playerId, directorName, agents } = req.body;
  if (!playerId || !Array.isArray(agents)) {
    return res
      .status(400)
      .json({ error: "Missing 'playerId' or 'agents' in body" });
  }

  // Enforce max 3 agents per player on this threat
  if (agents.length > 3) {
    return res.status(400).json({
      error: "You can only assign up to 3 agents to a single world threat.",
    });
  }

  const safeDirectorName = directorName || "Unknown Director";

  // Apply progress & damage with old assignments first
  tickThreat(threat);

  // Remove previous assignment for this player
  threat.assignedAgents = threat.assignedAgents.filter(
    (a) => a.playerId !== playerId
  );

  threat.assignedAgents.push({
    playerId,
    directorName: safeDirectorName,
    agents,
  });

  threat.lastTick = new Date().toISOString();

  res.json(threatWithEta(threat));
});

/**
 * Unassign this player's agents from a threat.
 *
 * Body: { "playerId": "player-123" }
 */
app.post("/world-threats/:instanceId/unassign", (req, res) => {
  const threat = findThreat(req.params.instanceId);
  if (!threat) return res.status(404).json({ error: "Not found" });

  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: "Missing 'playerId' in body" });
  }

  // Apply progress & damage with current assignments first
  tickThreat(threat);

  threat.assignedAgents = threat.assignedAgents.filter(
    (a) => a.playerId !== playerId
  );

  threat.lastTick = new Date().toISOString();

  res.json(threatWithEta(threat));
});

// Catch-all for unknown /world-threats routes – always return JSON
app.use("/world-threats", (req, res) => {
  res.status(404).json({
    error: "Unknown world threat route",
    method: req.method,
    path: req.originalUrl,
  });
});

// ===== START SERVER =====

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`World Threat backend running at http://localhost:${PORT}`);
});
