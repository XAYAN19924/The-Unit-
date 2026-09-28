const state = {
  score: Number(localStorage.getItem("theUnitScore") || 0),
  upgradeLevel: Number(localStorage.getItem("theUnitUpgradeLevel") || 0),
  rebirths: Number(localStorage.getItem("theUnitRebirths") || 0),
  ultraRebirths: Number(localStorage.getItem("theUnitUltraRebirths") || 0),
  prestige: Number(localStorage.getItem("theUnitPrestige") || 0),
  players: [],
  discordUserId: null,
  discordDisplayName: "Player",
  lastClicks: [],
  activeTab: "upgrades"
};

const $ = id => document.getElementById(id);
const scoreEl = $("score");
const leaderboardEl = $("leaderboard");
const sessionEl = $("sessionCount");
const cpsEl = $("cps");
const syncEl = $("syncStatus");

const DISCORD_CLIENT_ID = window.DISCORD_CLIENT_ID || "";
const API_URL = window.THE_UNIT_API_URL || "";
let discordSdk = null;
let socket = null;

const fmt = n => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const save = () => {
  localStorage.setItem("theUnitScore", state.score);
  localStorage.setItem("theUnitUpgradeLevel", state.upgradeLevel);
  localStorage.setItem("theUnitRebirths", state.rebirths);
  localStorage.setItem("theUnitUltraRebirths", state.ultraRebirths);
  localStorage.setItem("theUnitPrestige", state.prestige);
};

// Progression is deliberately layered. Each higher reset wipes the layers below it,
// while the higher layer permanently makes the lower layer more effective.
function upgradeEffect() {
  return 1 + state.upgradeLevel * (1 + state.rebirths * 0.15);
}

function rebirthMultiplier() {
  return 1 + state.rebirths * 0.25;
}

function ultraMultiplier() {
  return 1 + state.ultraRebirths * 1.5;
}

function prestigeMultiplier() {
  return 1 + state.prestige * 5;
}

function totalMultiplier() {
  return Math.max(1, upgradeEffect() * rebirthMultiplier() * ultraMultiplier() * prestigeMultiplier());
}

function upgradeCost(level = state.upgradeLevel) {
  // Gentle early curve, then a controlled ramp. No 1.75^level nonsense.
  return Math.floor(25 * Math.pow(1.115, level) + level * 7);
}

function bulkUpgradeCost(amount = 10) {
  let total = 0;
  for (let i = 0; i < amount; i++) total += upgradeCost(state.upgradeLevel + i);
  return Math.floor(total);
}

function rebirthCost() {
  // Rebirth remains click-based, but the old x5 curve was needlessly brutal.
  return Math.floor(10000 * Math.pow(2.35, state.rebirths));
}

function ultraRequirement() {
  return 10;
}

function prestigeRequirement() {
  return 5;
}

function resetUpgradeLayer() {
  state.score = 0;
  state.upgradeLevel = 0;
}

function resetRebirthLayer() {
  resetUpgradeLayer();
  state.rebirths = 0;
}

function resetUltraLayer() {
  resetRebirthLayer();
  state.ultraRebirths = 0;
}

function renderTabs() {
  $("multiplier").textContent = "x" + totalMultiplier().toFixed(2).replace(/\.00$/, "");
  $("clickPower").textContent = fmt(totalMultiplier());
  $("rebirthCount").textContent = fmt(state.rebirths);
  $("ultraCount").textContent = fmt(state.ultraRebirths);
  $("prestigeCount").textContent = fmt(state.prestige);

  const nextUpgradeCost = upgradeCost();
  const bulkCost = bulkUpgradeCost(10);

  $("upgradesTab").innerHTML = `
    <div class="progress-note">
      <span>Upgrade power</span><strong>+${(1 + state.rebirths * 0.15).toFixed(2)} per level</strong>
    </div>
    <div class="upgrade-grid">
      <button class="upgrade" type="button" data-action="upgrade" ${state.score < nextUpgradeCost ? "disabled" : ""}>
        <div class="upgrade-title">Click Power +1</div>
        <div class="upgrade-desc">Increase your click strength. Rebirths make every upgrade 15% stronger per Rebirth.</div>
        <div class="upgrade-meta"><span class="cost">${fmt(nextUpgradeCost)} clicks</span><span class="owned">Lv. ${state.upgradeLevel}</span></div>
      </button>
      <button class="upgrade" type="button" data-action="upgrade10" ${state.score < bulkCost ? "disabled" : ""}>
        <div class="upgrade-title">Power Pack +10</div>
        <div class="upgrade-desc">Buy ten levels at once using the real combined cost.</div>
        <div class="upgrade-meta"><span class="cost">${fmt(bulkCost)} clicks</span><span class="owned">FAST</span></div>
      </button>
    </div>`;

  $("rebirthTab").innerHTML = `
    <div class="reset-card">
      <h3>Rebirth</h3>
      <p>Reset clicks and upgrades. Gain +25% permanent multiplier. Every Rebirth also makes future upgrades 15% stronger. Requirement: ${fmt(rebirthCost())} clicks.</p>
      <button type="button" data-action="rebirth" ${state.score < rebirthCost() ? "disabled" : ""}>REBIRTH • +25% MULTIPLIER</button>
      <div class="reset-info">Current bonus: x${rebirthMultiplier().toFixed(2)} • Next: x${(rebirthMultiplier() + 0.25).toFixed(2)}</div>
    </div>`;

  const ultraReady = state.rebirths >= ultraRequirement();
  $("ultrarebirthTab").innerHTML = `
    <div class="reset-card">
      <h3>Ultra Rebirth</h3>
      <p>Reset clicks, upgrades and Rebirths. Gain a permanent +1.5x layer multiplier. Requirement: ${ultraRequirement()} Rebirths.</p>
      <button type="button" data-action="ultra" ${!ultraReady ? "disabled" : ""}>ULTRA REBIRTH • +1.5x LAYER</button>
      <div class="reset-info">Progress: ${state.rebirths} / ${ultraRequirement()} Rebirths</div>
    </div>`;

  const prestigeReady = state.ultraRebirths >= prestigeRequirement();
  $("prestigeTab").innerHTML = `
    <div class="reset-card">
      <h3>Prestige</h3>
      <p>Reset everything below Prestige. Gain a permanent +5x prestige multiplier. Requirement: ${prestigeRequirement()} Ultra Rebirths.</p>
      <button type="button" data-action="prestige" ${!prestigeReady ? "disabled" : ""}>PRESTIGE • +5x MULTIPLIER</button>
      <div class="reset-info">Progress: ${state.ultraRebirths} / ${prestigeRequirement()} Ultra Rebirths</div>
    </div>`;
}

function render() {
  scoreEl.textContent = fmt(state.score);
  renderTabs();
  updateCps();

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  leaderboardEl.innerHTML = sorted.length ? sorted.map((p, i) => `
    <li class="rank">
      <div class="rank-left">
        <span class="rank-num">#${i + 1}</span>
        <span class="rank-name ${p.id === state.discordUserId ? "you" : ""}">${escapeHtml(p.name)}${p.id === state.discordUserId ? " (YOU)" : ""}</span>
      </div>
      <div class="rank-score">
        <strong>${fmt(p.score)}</strong>
        <small>x${Number(p.multiplier || 1).toFixed(2)}</small>
      </div>
    </li>`).join("") : `<li class="empty">No players connected yet.</li>`;
  sessionEl.textContent = Math.max(1, state.players.length);
  save();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function updateCps() {
  const now = Date.now();
  state.lastClicks = state.lastClicks.filter(t => now - t < 1000);
  cpsEl.textContent = state.lastClicks.length.toFixed(1);
}

$("clickButton").addEventListener("click", () => {
  const power = totalMultiplier();
  state.score += power;
  state.lastClicks.push(Date.now());
  if (state.lastClicks.length > 100) state.lastClicks.shift();
  render();
  syncScore();
});

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  state.activeTab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === btn));
  document.querySelectorAll(".tab-content").forEach(x => x.classList.toggle("active", x.id === state.activeTab + "Tab"));
}));

$("tabPanel").addEventListener("click", e => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "upgrade" && state.score >= upgradeCost()) {
    state.score -= upgradeCost();
    state.upgradeLevel++;
  } else if (action === "upgrade10" && state.score >= bulkUpgradeCost(10)) {
    const cost = bulkUpgradeCost(10);
    state.score -= cost;
    state.upgradeLevel += 10;
  } else if (action === "rebirth" && state.score >= rebirthCost()) {
    state.rebirths++;
    resetUpgradeLayer();
  } else if (action === "ultra" && state.rebirths >= ultraRequirement()) {
    state.ultraRebirths++;
    resetRebirthLayer();
  } else if (action === "prestige" && state.ultraRebirths >= prestigeRequirement()) {
    state.prestige++;
    resetUltraLayer();
  } else {
    return;
  }

  render();
  syncScore();
});

setInterval(updateCps, 100);
setInterval(syncScore, 1000);

function setPlayers(participants) {
  const map = new Map(state.players.map(p => [p.id, p]));
  state.players = participants.map(u => {
    const id = String(u.id);
    const old = map.get(id);
    return {
      id,
      name: u.global_name || u.display_name || u.username || "Discord Player",
      score: old?.score || 0,
      multiplier: old?.multiplier || 1
    };
  });

  const me = state.players.find(p => p.id === state.discordUserId);
  if (me) {
    me.name = state.discordDisplayName;
    me.score = state.score;
    me.multiplier = totalMultiplier();
  }
  render();
}

async function initDiscord() {
  try {
    if (!DISCORD_CLIENT_ID) throw new Error("Missing DISCORD_CLIENT_ID");

    const module = await import("https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/+esm");
    discordSdk = new module.DiscordSDK(DISCORD_CLIENT_ID);
    await discordSdk.ready();

    const result = await discordSdk.commands.getInstanceConnectedParticipants();
    setPlayers(result.participants || []);

    // Discord's participant list does not promise the current user is first.
    // In the Activity context, authorizing gives us the current user's identity.
    try {
      const auth = await discordSdk.commands.authorize({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        state: crypto.randomUUID(),
        prompt: "none",
        scope: ["identify"]
      });
      if (auth?.user) {
        state.discordUserId = String(auth.user.id);
        state.discordDisplayName = auth.user.global_name || auth.user.display_name || auth.user.username || "Discord Player";
      }
    } catch {
      const fallback = result.participants?.find(p => p.user?.id) || result.participants?.[0];
      const user = fallback?.user || fallback;
      if (user?.id) {
        state.discordUserId = String(user.id);
        state.discordDisplayName = user.global_name || user.display_name || user.username || "Discord Player";
      }
    }

    discordSdk.subscribe(module.Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, payload => {
      setPlayers(payload.participants || []);
    });

    syncEl.textContent = "DISCORD";
    syncEl.className = "sync live";
    if (state.discordUserId) syncScore();
  } catch (err) {
    console.warn("Discord SDK unavailable:", err);
    syncEl.textContent = "LOCAL";
    syncEl.className = "sync offline";
    state.discordUserId = "local";
    state.discordDisplayName = "You";
    if (!state.players.length) state.players = [{ id: "local", name: "You", score: state.score, multiplier: totalMultiplier() }];
    render();
  }
}

function syncScore() {
  const me = state.players.find(p => p.id === state.discordUserId);
  if (me) {
    me.name = state.discordDisplayName;
    me.score = state.score;
    me.multiplier = totalMultiplier();
  }

  if (socket?.readyState === WebSocket.OPEN && state.discordUserId) {
    socket.send(JSON.stringify({
      type: "score",
      id: state.discordUserId,
      name: state.discordDisplayName,
      score: state.score,
      multiplier: totalMultiplier()
    }));
  }

  if (API_URL && state.discordUserId) {
    fetch(API_URL.replace(/\/$/, "") + "/player", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: state.discordUserId, name: state.discordDisplayName, score: state.score, multiplier: totalMultiplier() })
    }).catch(() => {});
  }
  render();
}

function initRealtime() {
  const url = API_URL
    ? API_URL.replace(/^http/, "ws").replace(/\/$/, "")
    : (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

  try {
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      syncEl.textContent = "LIVE";
      syncEl.className = "sync live";
      syncScore();
    });
    socket.addEventListener("message", e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== "players") return;
        state.players = (msg.players || []).map(p => ({
          ...p,
          score: Number(p.score || 0),
          multiplier: Number(p.multiplier || 1)
        }));
        const me = state.players.find(p => p.id === state.discordUserId);
        if (me) {
          state.score = me.score;
          state.discordDisplayName = me.name;
        }
        render();
      } catch {}
    });
    socket.addEventListener("close", () => {
      if (syncEl.textContent === "LIVE") {
        syncEl.textContent = "DISCORD";
        syncEl.className = "sync live";
      }
    });
  } catch {}
}

render();
initDiscord().then(initRealtime);
