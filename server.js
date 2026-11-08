const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const url = require('url');

const PORT = process.env.PORT || 8080;
const USERS_FILE = './users.json';
const ADMIN_PASSWORD = "master123";   // Admin panel ka password (change kar lena)

// ================== USERS ==================
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

// ================== HTTP (Admin Panel) ==================
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // Admin Page
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
    .btn-red { background: #ef4444; color: white; float: right; }
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
        if (data.error) {
          document.getElementById('loginError').innerText = data.error;
        } else {
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
      list.innerHTML += \`
        <div class="user">
          <span><b>\${u}</b> &nbsp;→&nbsp; \${users[u]}</span>
          <button class="btn-red" onclick="deleteUser('\${u}')">Delete</button>
        </div>\`;
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
    })
    .then(r => r.json())
    .then(data => {
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
    })
    .then(r => r.json())
    .then(data => {
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

  // API: Get Users
  if (parsed.pathname === '/api/users') {
    if (parsed.query.admin !== ADMIN_PASSWORD) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Wrong admin password" }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }));
    return;
  }

  // API: Add User
  if (parsed.pathname === '/api/add' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.admin !== ADMIN_PASSWORD) {
          res.end(JSON.stringify({ error: "Wrong admin password" }));
          return;
        }
        users[data.username] = data.password;
        saveUsers();
        res.end(JSON.stringify({ users }));
      } catch (e) {
        res.end(JSON.stringify({ error: "Invalid data" }));
      }
    });
    return;
  }

  // API: Delete User
  if (parsed.pathname === '/api/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.admin !== ADMIN_PASSWORD) {
          res.end(JSON.stringify({ error: "Wrong admin password" }));
          return;
        }
        delete users[data.username];
        saveUsers();
        res.end(JSON.stringify({ users }));
      } catch (e) {
        res.end(JSON.stringify({ error: "Invalid data" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ================== WEBSOCKET ==================
const wss = new WebSocket.Server({ server });

let windowsClient = null;

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // -------- Login (Android) --------
      if (data.type === 'login') {
        const { username, password } = data;
        if (users[username] && users[username] === password) {
          ws.send(JSON.stringify({ type: 'login_result', success: true }));
          console.log('Login success:', username);
        } else {
          ws.send(JSON.stringify({ type: 'login_result', success: false }));
          console.log('Login failed:', username);
        }
        return;
      }

      // -------- Register --------
      if (data.type === 'register') {
        if (data.role === 'windows') {
          windowsClient = ws;
          ws.send(JSON.stringify({ type: 'status', msg: 'Windows Connected' }));
          console.log('Windows registered');
        }
        if (data.role === 'phone') {
          ws.send(JSON.stringify({ type: 'status', msg: 'Phone Connected' }));
          console.log('Phone registered');
        }
        return;
      }

      // -------- Click from Phone --------
      if (data.type === 'click' && windowsClient && windowsClient.readyState === WebSocket.OPEN) {
        windowsClient.send(JSON.stringify({
          type: 'click',
          side: data.side          // "A" or "B"
        }));
        console.log('Click forwarded:', data.side);
        return;
      }

    } catch (e) {
      console.log('Message error:', e.message);
    }
  });

  ws.on('close', () => {
    if (ws === windowsClient) {
      windowsClient = null;
      console.log('Windows disconnected');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
