const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const url = require('url');

const PORT = process.env.PORT || 8080;
const USERS_FILE = './users.json';
const ADMIN_PASSWORD = "Chinu@143";

let users = { "admin": "1234" };

try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } else {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }
} catch (e) {
  console.log("Users load error:", e.message);
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {}
}

const windowsClients = {};
const phoneClients = {};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>MYclick Admin</title></head><body style="background:#111;color:#fff;font-family:sans-serif;padding:40px"><h1>MYclick Admin</h1><p>Admin panel here</p></body></html>`);
    return;
  }

  if (parsed.pathname === '/api/users') {
    if (parsed.query.admin !== ADMIN_PASSWORD) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: "Wrong admin password" }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  let currentUser = null;
  let currentRole = null;
  const clientIP = req.socket.remoteAddress || "unknown";

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // LOGIN
      if (data.type === 'login') {
        const { username, password, role } = data;
        if (users[username] && users[username] === password) {
          currentUser = username;
          currentRole = role || 'phone';

          if (currentRole === 'windows') {
            if (windowsClients[username]) {
              try { windowsClients[username].close(); } catch(e) {}
            }
            windowsClients[username] = ws;
          }

          if (currentRole === 'phone') {
            phoneClients[username] = ws;
          }

          ws.send(JSON.stringify({ type: 'login_result', success: true }));
          console.log(`Login: ${username} (${currentRole})`);
        } else {
          ws.send(JSON.stringify({ type: 'login_result', success: false }));
        }
        return;
      }

      // CLICK from Phone → Windows
      if (data.type === 'click' && currentUser && currentRole === 'phone') {
        const target = windowsClients[currentUser];
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({
            type: 'click',
            side: data.side,
            ip: clientIP
          }));
          console.log(`Click ${data.side} → ${currentUser}`);
        }
        return;
      }

      // ACK from Windows → Phone
      if (data.type === 'click_ack' && currentUser && currentRole === 'windows') {
        const phone = phoneClients[currentUser];
        if (phone && phone.readyState === WebSocket.OPEN) {
          phone.send(JSON.stringify({ type: 'click_ack' }));
          console.log(`Ack → ${currentUser}`);
        }
        return;
      }

    } catch (e) {
      console.log("Error:", e.message);
    }
  });

  ws.on('close', () => {
    if (currentRole === 'windows' && currentUser && windowsClients[currentUser] === ws) {
      delete windowsClients[currentUser];
    }
    if (currentRole === 'phone' && currentUser && phoneClients[currentUser] === ws) {
      delete phoneClients[currentUser];
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
