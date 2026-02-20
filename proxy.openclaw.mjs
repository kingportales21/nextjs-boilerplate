// HTTP + WebSocket reverse proxy
// 0.0.0.0:18789 -> 127.0.0.1:18790
import http from 'node:http';
import net from 'node:net';

const TARGET = '127.0.0.1';
const TARGET_PORT = parseInt(process.env.INTERNAL_PORT || '18790');
const LISTEN_PORT = parseInt(process.env.EXTERNAL_PORT || '18789');

// HTTP requests
const server = http.createServer((req, res) => {
  const proxyReq = http.request(
    { hostname: TARGET, port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
  req.pipe(proxyReq);
});

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  const proxy = net.createConnection(TARGET_PORT, TARGET, () => {
    const raw = `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n';
    proxy.write(raw);
    if (head.length > 0) proxy.write(head);
    socket.pipe(proxy).pipe(socket);
  });
  proxy.on('error', () => socket.destroy());
  socket.on('error', () => proxy.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[proxy] 0.0.0.0:${LISTEN_PORT} -> ${TARGET}:${TARGET_PORT}`);
});
