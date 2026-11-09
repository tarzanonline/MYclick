const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const url = require('url');

const PORT = process.env.PORT || 8080;
const USERS_FILE = './users.json';
const ADMIN_PASSWORD = "Chinu143";

// Users database
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
  } catch (e) {
    console.log("Save error:", e.message);
  }
}

// Connected Windows clients (username → websocket)
const windowsClients = {};

// ================== HTTP Admin Panel ==================
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Remote Clicker - Admin</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial; background: #0f0f0f; color: #eee; margin: 0; padding: 40px; }
    h1 { margin-bottom: 5px; }
    .card { background: #1a1a1a; padding: 20px; border-radius: 10px; margin-bottom: 20px; max-width: 500px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: none; border-radius: 6px; background: #2a2a2a; color: white; font-size: 15px; }
    button { padding: 10px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 8px; }
    .btn-green { background: #4ade80; color: black; font-weight: bold; }
    .btn-red { background: #ef4444; color: white; }
    .user { background: #252525; padding: 12px 15px; margin: 8px 0; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
    #loginError { color: #f87171; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Remote Clicker</h1>
  <p style="color:#888; margin-bottom:30px;">Admin Panel</p>

  <div id="loginSection" class="card">
    <h3>Admin Login</h3>
    <input type="password" id="adminPass" placeholder="Admin Password">
    <button class="btn-green" onclick="login()">Login</button>
    <p id="loginError"></p>
  </div>

  <div id="panel" style="display:none;">
    <div class="card">
      <h3>Add New User</h3>
      <input type="text" id="newUser" placeholder="Username">
      <input type="text" id="newPass" placeholder="Password">
      <button class="btn-green" onclick="addUser()">Add User</button>
    </div>
    <div class="card">
      <h3>All Users</h3>
      <div id="userList"></div>
    </div>
  </div>

<script>
  let adminPass = "";
  function login() {
    adminPass = document.getElementById('adminPass').value;
    fetch('/api/users?admin=' + encodeURIComponent(adminPass))
      .then(r => r.json())
      .then(data => {
        if (data.error) document.getElementById('loginError').innerText = data.error;
        else {
          document.getElementById('loginSection').style.display = 'none';
          document.getElementById('panel').style.display = 'block';
          renderUsers(data.users);
        }
      });
  }
  function renderUsers(users) {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    for (let u in users) {
      list.innerHTML += \`<div class="user"><span><b>\${u}</b> → \${users[u]}</span>
      <button class="btn-red" onclick="deleteUser('\${u}')">Delete</button></div>\`;
    }
  }
  function addUser() {
    const username = document.getElementById('newUser').value.trim();
    const password = document.getElementById('newPass').value.trim();
    if (!username || !password) return alert("Dono fields bharo");
    fetch('/api/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin: adminPass, username, password })
    }).then(r => r.json()).then(data => {
      if (data.error) alert(data.error);
      else {
        renderUsers(data.users);
        document.getElementById('newUser').value = '';
        document.getElementById('newPass').value = '';
      }
    });
  }
  function deleteUser(username) {
    if (!confirm("Delete " + username + "?")) return;
    fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin: adminPass, username })
    }).then(r => r.json()).then(data => {
      if (data.error) alert(data.error);
      else renderUsers(data.users);
    });
  }
</script>
</body>
</html>
    `);
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

  if (parsed.pathname === '/api/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      if (data.admin !== ADMIN_PASSWORD) return res.end(JSON.stringify({ error: "Wrong admin password" }));
      users[data.username] = data.password;
      saveUsers();
      res.end(JSON.stringify({ users }));
    });
    return;
  }

  if (parsed.pathname === '/api/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      if (data.admin !== ADMIN_PASSWORD) return res.end(JSON.stringify({ error: "Wrong admin password" }));
      delete users[data.username];
      saveUsers();
      res.end(JSON.stringify({ users }));
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ================== WEBSOCKET ==================
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let currentUser = null;
  let currentRole = null;

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
            // Purana connection hata do agar same user ka pehle se hai
            if (windowsClients[username]) {
              try { windowsClients[username].close(); } catch(e) {}
            }
            windowsClients[username] = ws;
          }

          ws.send(JSON.stringify({ type: 'login_result', success: true, role: currentRole }));
          console.log(`Login success: ${username} (${currentRole})`);
        } else {
          ws.send(JSON.stringify({ type: 'login_result', success: false }));
          console.log(`Login failed: ${username}`);
        }
        return;
      }

     // CLICK (sirf phone se aayega)
if (data.type === 'click' && currentUser && currentRole === 'phone') {
  const target = windowsClients[currentUser];
  if (target && target.readyState === WebSocket.OPEN) {
    // Phone ka IP nikaalo
    const phoneIP = ws._socket?.remoteAddress || "unknown";
    
    target.send(JSON.stringify({
      type: 'click',
      side: data.side,
      ip: phoneIP
    }));
    console.log(`Click ${data.side} from ${currentUser} (IP: ${phoneIP})`);
  } else {
    console.log(`No Windows client for user: ${currentUser}`);
  }
  return;
}
      }

    } catch (e) {
      console.log("Error:", e.message);
    }
  });

  ws.on('close', () => {
    if (currentRole === 'windows' && currentUser && windowsClients[currentUser] === ws) {
      delete windowsClients[currentUser];
      console.log(`Windows disconnected: ${currentUser}`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
