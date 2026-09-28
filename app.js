const state = {
  score: Number(localStorage.getItem("theUnitScore") || 0),
  clickPower: Number(localStorage.getItem("theUnitClickPower") || 1),
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

const fmt = n => Number(n || 0).toLocaleString("en-US", {maximumFractionDigits: 0});
const save = () => {
  localStorage.setItem("theUnitScore", state.score);
  localStorage.setItem("theUnitClickPower", state.clickPower);
  localStorage.setItem("theUnitUpgradeLevel", state.upgradeLevel);
  localStorage.setItem("theUnitRebirths", state.rebirths);
  localStorage.setItem("theUnitUltraRebirths", state.ultraRebirths);
  localStorage.setItem("theUnitPrestige", state.prestige);
};

function totalMultiplier() {
  return Math.max(1, state.clickPower + state.rebirths * 5 + state.ultraRebirths * 50 + state.prestige * 500);
}

function upgradeCost() {
  return Math.floor(25 * Math.pow(1.75, state.upgradeLevel));
}
function rebirthCost() {
  return 10000 * Math.pow(5, state.rebirths);
}
function ultraCost() {
  return 1000000 * Math.pow(10, state.ultraRebirths);
}
function prestigeCost() {
  return 100000000 * Math.pow(100, state.prestige);
}

function renderTabs() {
  $("multiplier").textContent = "x" + fmt(totalMultiplier());
  $("clickPower").textContent = fmt(totalMultiplier());
  $("rebirthCount").textContent = fmt(state.rebirths);
  $("ultraCount").textContent = fmt(state.ultraRebirths);
  $("prestigeCount").textContent = fmt(state.prestige);

  $("upgradesTab").innerHTML = `
    <div class="upgrade-grid">
      <button class="upgrade" data-action="upgrade" ${state.score < upgradeCost() ? "disabled" : ""}>
        <div class="upgrade-title">Click Power +1</div>
        <div class="upgrade-desc">Increase your base click strength.</div>
        <div class="upgrade-meta"><span class="cost">${fmt(upgradeCost())} clicks</span><span class="owned">Lv. ${state.upgradeLevel}</span></div>
      </button>
      <button class="upgrade" data-action="upgrade10" ${state.score < upgradeCost() * 10 ? "disabled" : ""}>
        <div class="upgrade-title">Power Pack +10</div>
        <div class="upgrade-desc">Buy ten upgrades at once.</div>
        <div class="upgrade-meta"><span class="cost">${fmt(upgradeCost() * 10)} clicks</span><span class="owned">FAST</span></div>
      </button>
    </div>`;

  $("rebirthTab").innerHTML = `
    <div class="reset-card">
      <h3>Rebirth</h3>
      <p>Reset your clicks and upgrades. Gain +5 permanent click power. Requirement: ${fmt(rebirthCost())} clicks.</p>
      <button data-action="rebirth" ${state.score < rebirthCost() ? "disabled" : ""}>REBIRTH • +5 POWER</button>
    </div>`;

  $("ultrarebirthTab").innerHTML = `
    <div class="reset-card">
      <h3>Ultra Rebirth</h3>
      <p>Reset clicks, upgrades and rebirths. Gain +50 permanent click power. Requirement: ${fmt(ultraCost())} clicks.</p>
      <button data-action="ultra" ${state.score < ultraCost() ? "disabled" : ""}>ULTRA REBIRTH • +50 POWER</button>
    </div>`;

  $("prestigeTab").innerHTML = `
    <div class="reset-card">
      <h3>Prestige</h3>
      <p>Full progression reset. Gain +500 permanent click power. Requirement: ${fmt(prestigeCost())} clicks.</p>
      <button data-action="prestige" ${state.score < prestigeCost() ? "disabled" : ""}>PRESTIGE • +500 POWER</button>
    </div>`;
}

function render() {
  scoreEl.textContent = fmt(state.score);
  renderTabs();
  updateCps();
  save();

  const sorted = [...state.players].sort((a,b) => b.score - a.score);
  leaderboardEl.innerHTML = sorted.length ? sorted.map((p,i) => `
    <li class="rank">
      <div class="rank-left">
        <span class="rank-num">#${i+1}</span>
        <span class="rank-name ${p.id === state.discordUserId ? "you" : ""}">${escapeHtml(p.name)}${p.id === state.discordUserId ? " (YOU)" : ""}</span>
      </div>
      <div class="rank-score">
        <strong>${fmt(p.score)}</strong>
        <small>x${fmt(p.multiplier || 1)}</small>
      </div>
    </li>`).join("") : `<li class="empty">No players connected yet.</li>`;
  sessionEl.textContent = Math.max(1, state.players.length);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
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
    state.clickPower++;
    state.upgradeLevel++;
  } else if (action === "upgrade10" && state.score >= upgradeCost() * 10) {
    state.score -= upgradeCost() * 10;
    state.clickPower += 10;
    state.upgradeLevel += 10;
  } else if (action === "rebirth" && state.score >= rebirthCost()) {
    state.score = 0;
    state.clickPower = 1;
    state.upgradeLevel = 0;
    state.rebirths++;
  } else if (action === "ultra" && state.score >= ultraCost()) {
    state.score = 0;
    state.clickPower = 1;
    state.upgradeLevel = 0;
    state.rebirths = 0;
    state.ultraRebirths++;
  } else if (action === "prestige" && state.score >= prestigeCost()) {
    state.score = 0;
    state.clickPower = 1;
    state.upgradeLevel = 0;
    state.rebirths = 0;
    state.ultraRebirths = 0;
    state.prestige++;
  }
  render();
  syncScore();
});

setInterval(updateCps, 100);
setInterval(syncScore, 1000);

function setPlayers(participants) {
  const map = new Map(state.players.map(p => [p.id, p]));
  state.players = participants.map(u => {
    const old = map.get(String(u.id));
    return {
      id: String(u.id),
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

    const me = result.participants?.[0];
    if (me) {
      // Prefer the current user when it is present in the participant list.
      state.discordUserId = String(me.id);
      state.discordDisplayName = me.global_name || me.display_name || me.username || "Discord Player";
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
    // Browser fallback.
    state.discordUserId = "local";
    state.discordDisplayName = "You";
    if (!state.players.length) state.players = [{id:"local",name:"You",score:state.score,multiplier:totalMultiplier()}];
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
      type:"score",
      id:state.discordUserId,
      name:state.discordDisplayName,
      score:state.score,
      multiplier:totalMultiplier()
    }));
  }

  if (API_URL && state.discordUserId) {
    fetch(API_URL.replace(/\/$/,"") + "/player", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:state.discordUserId,name:state.discordDisplayName,score:state.score,multiplier:totalMultiplier()})
    }).catch(()=>{});
  }
  render();
}

function initRealtime() {
  const url = API_URL
    ? API_URL.replace(/^http/,"ws").replace(/\/$/,"")
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
        if (msg.type === "players") {
          const current = new Map(state.players.map(p => [p.id,p]));
          state.players = (msg.players || []).map(p => ({
            ...p,
            score: Number(p.score || 0),
            multiplier: Number(p.multiplier || 1)
          }));
          const me = state.players.find(p => p.id === state.discordUserId);
          if (me) {
            state.score = me.score;
            state.discordDisplayName = me.name;
          } else if (current.has(state.discordUserId)) {
            const old = current.get(state.discordUserId);
            state.score = old.score;
          }
          render();
        }
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
