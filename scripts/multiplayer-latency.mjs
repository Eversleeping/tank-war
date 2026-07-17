import WebSocket from 'ws';

const rawUrl = process.argv[2];
if (!rawUrl) {
  console.error('Usage: pnpm latency:multiplayer -- wss://host/ws');
  process.exit(1);
}

const url = new URL(rawUrl);
if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
  throw new Error('Expected a ws:// or wss:// URL');
}

const samples = Number(process.argv[3] ?? 10);
const startedAt = performance.now();
const socket = new WebSocket(url);
const waitForMessage = (predicate, timeoutMs) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    socket.off('message', onMessage);
    reject(new Error('Timed out waiting for server message'));
  }, timeoutMs);
  const onMessage = (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    } catch {
      // Snapshot frames are gzip-compressed and irrelevant to this probe.
    }
  };
  socket.on('message', onMessage);
});
const welcomePromise = waitForMessage((message) => message.type === 'welcome', 8000);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('WebSocket connection timed out')), 8000);
  socket.once('open', () => {
    clearTimeout(timer);
    resolve();
  });
  socket.once('error', reject);
});
const connectedMs = performance.now() - startedAt;
await welcomePromise;
const welcomeMs = performance.now() - startedAt;

const rtts = [];
for (let index = 0; index < samples; index++) {
  rtts.push(await new Promise((resolve, reject) => {
    const pingAt = performance.now();
    const timer = setTimeout(() => reject(new Error('WebSocket ping timed out')), 5000);
    socket.once('pong', () => {
      clearTimeout(timer);
      resolve(performance.now() - pingAt);
    });
    socket.ping();
  }));
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const applicationPingId = Math.floor(performance.now());
const applicationPingAt = performance.now();
const applicationPong = waitForMessage(
  (message) => message.type === 'pong' && message.id === applicationPingId,
  1500,
).then(() => performance.now() - applicationPingAt, () => null);
socket.send(JSON.stringify({ type: 'ping', id: applicationPingId }));
const applicationRttMs = await applicationPong;
socket.close();

const sorted = [...rtts].sort((a, b) => a - b);
const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)];
console.log(JSON.stringify({
  url: url.toString(),
  connectMs: Number(connectedMs.toFixed(1)),
  welcomeMs: Number(welcomeMs.toFixed(1)),
  applicationRttMs: applicationRttMs === null ? null : Number(applicationRttMs.toFixed(1)),
  samples,
  minRttMs: Number(sorted[0].toFixed(1)),
  medianRttMs: Number(percentile(0.5).toFixed(1)),
  p95RttMs: Number(percentile(0.95).toFixed(1)),
  maxRttMs: Number(sorted.at(-1).toFixed(1)),
}, null, 2));
