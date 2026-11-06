const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ port: PORT });

let windowsClient = null;
let phoneClient = null;

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'register') {
        if (data.role === 'windows') {
          windowsClient = ws;
          ws.send(JSON.stringify({ type: 'status', msg: 'Windows Connected' }));
          console.log('Windows registered');
        }
        if (data.role === 'phone') {
          phoneClient = ws;
          ws.send(JSON.stringify({ type: 'status', msg: 'Phone Connected' }));
          console.log('Phone registered');
        }
      }

      if (data.type === 'click' && windowsClient && windowsClient.readyState === WebSocket.OPEN) {
        windowsClient.send(JSON.stringify({
          type: 'click',
          side: data.side
        }));
        console.log('Click forwarded:', data.side);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  });

  ws.on('close', () => {
    if (ws === windowsClient) {
      windowsClient = null;
      console.log('Windows disconnected');
    }
    if (ws === phoneClient) {
      phoneClient = null;
      console.log('Phone disconnected');
    }
  });
});

console.log(`Server running on port ${PORT}`);
