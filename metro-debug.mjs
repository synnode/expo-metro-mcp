import WebSocket from './node_modules/ws/index.js';

const list = await fetch('http://localhost:8081/json/list').then(r => r.json());
console.log('targets:', JSON.stringify(list.map(t => ({id: t.id, title: t.title}))));

if (!list.length) { console.log('no targets'); process.exit(0); }

const url = list[0].webSocketDebuggerUrl;
console.log('connecting to:', url);

const ws = new WebSocket(url);
ws.on('open', () => {
  console.log('CDP connected');
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable', params: {} }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    console.log(`[${msg.params.type.toUpperCase()}] ${args}`);
  } else {
    console.log('RAW:', data.toString().slice(0, 300));
  }
});
ws.on('error', e => console.log('ERR:', e.message));

setTimeout(() => process.exit(0), 12000);
