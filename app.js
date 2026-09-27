const state={score:Number(localStorage.getItem("theUnitScore")||0),players:[
{name:"Piętek",score:1842},
{name:"Kacper",score:1320},
{name:"Mati",score:980},
{name:"Kuba",score:615},
{name:"Olek",score:241}
]};

const scoreEl=document.getElementById("score");
const playersEl=document.getElementById("players");
const leaderboardEl=document.getElementById("leaderboard");
const sessionEl=document.getElementById("sessionCount");

function render(){
  scoreEl.textContent=state.score.toLocaleString("pl-PL");
  localStorage.setItem("theUnitScore",state.score);
  const me={name:"Ty",score:state.score};
  const all=[...state.players.filter(p=>p.name!=="Ty"),me].sort((a,b)=>b.score-a.score);
  playersEl.innerHTML=all.map(p=>`<div class="player"><div class="avatar">${p.name==="Ty"?"TY":p.name[0]}</div><div class="name">${p.name}</div><span class="online"></span></div>`).join("");
  leaderboardEl.innerHTML=all.map((p,i)=>`<li class="rank"><span><strong>#${i+1}</strong> ${p.name}</span><strong>${p.score.toLocaleString("pl-PL")}</strong></li>`).join("");
  sessionEl.textContent=all.length;
}
document.getElementById("clickButton").addEventListener("click",()=>{state.score++;render()});
render();

// Placeholder API for wiring Discord Embedded App SDK / realtime backend.
window.TheUnit={setPlayers(players){state.players=players;render()},setSessionCount(n){sessionEl.textContent=n}};
