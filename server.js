const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const players = new Map();

const mime = {
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8"
};

const server = http.createServer((req,res) => {
  if (req.method === "POST" && req.url === "/player") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const p = JSON.parse(body);
        if (p.id) players.set(String(p.id), {
          id:String(p.id),
          name:String(p.name || "Discord Player").slice(0,64),
          score:Number(p.score || 0),
          multiplier:Number(p.multiplier || 1)
        });
        broadcast();
        res.writeHead(204); res.end();
      } catch {
        res.writeHead(400); res.end();
      }
    });
    return;
  }

  let file = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err,data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {"Content-Type":mime[path.extname(full)] || "application/octet-stream"});
    res.end(data);
  });
});

const wss = new WebSocket.Server({server});

function snapshot() {
  return JSON.stringify({type:"players",players:[...players.values()]});
}
function broadcast() {
  const msg = snapshot();
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}
wss.on("connection", ws => {
  ws.send(snapshot());
  ws.on("message", raw => {
    try {
      const p = JSON.parse(raw.toString());
      if (p.type !== "score" || !p.id) return;
      players.set(String(p.id), {
        id:String(p.id),
        name:String(p.name || "Discord Player").slice(0,64),
        score:Number(p.score || 0),
        multiplier:Number(p.multiplier || 1)
      });
      broadcast();
    } catch {}
  });
});

server.listen(PORT, () => console.log(`The Unit running on port ${PORT}`));
