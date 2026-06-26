/**
 * Transparent WebSocket + HTTP proxy that forwards LiveKit signaling and
 * TURN relay traffic from the Express server (port 5000) to the local
 * LiveKit SFU (port 7880) and TURN server (port 5443).
 *
 *   Browser → wss://<replit-domain>/rtc?...   → ws://localhost:7880/rtc?...
 *   Browser → wss://<replit-domain>/turn-ws   → ws://localhost:5443  (TURN relay)
 *   Browser → https://<replit-domain>/twirp/…  → http://localhost:7880/twirp/…
 *
 * All WebSocket legs use raw TCP tunnels so we never parse or re-frame
 * WebSocket messages — bytes flow straight through.
 */

import { type Server as HttpServer, type IncomingMessage, request as httpRequest } from 'http';
import { connect as tcpConnect } from 'net';
import type { Express, Request, Response } from 'express';

const LIVEKIT_HOST = '127.0.0.1';
const SIGNAL_PORT  = 7880;   // LiveKit signal + RTC (force_tcp)
const TURN_PORT    = 5443;   // LiveKit TURN TLS (external_tls: true)

function tcpTunnel(
  req: IncomingMessage,
  socket: any,
  head: Buffer,
  targetHost: string,
  targetPort: number,
): void {
  const upstream = tcpConnect({ host: targetHost, port: targetPort }, () => {
    const headerLines = Object.entries(req.headers)
      .filter(([k]) => k !== 'host')
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');

    const requestLine = `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1\r\n`;
    const hostHeader  = `host: ${targetHost}:${targetPort}\r\n`;
    upstream.write(`${requestLine}${hostHeader}${headerLines}\r\n\r\n`);
    if (head && head.length > 0) upstream.write(head);

    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on('error', (err: Error) => {
    console.error(`[livekit-proxy] upstream error (${targetPort})`, err.message);
    try { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch { /* noop */ }
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
}

export function setupLiveKitProxy(server: HttpServer, app: Express): void {

  // ── WebSocket proxy ───────────────────────────────────────────────────
  server.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
    const url = req.url ?? '';
    if (url.startsWith('/rtc')) {
      tcpTunnel(req, socket, head, LIVEKIT_HOST, SIGNAL_PORT);
    } else if (url.startsWith('/turn')) {
      tcpTunnel(req, socket, head, LIVEKIT_HOST, TURN_PORT);
    }
  });

  // ── HTTP proxy: /twirp ────────────────────────────────────────────────
  app.use('/twirp', (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const proxyReq = httpRequest(
        {
          hostname: LIVEKIT_HOST,
          port: SIGNAL_PORT,
          path: `/twirp${req.path}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`,
          method: req.method,
          headers: { ...req.headers, host: `${LIVEKIT_HOST}:${SIGNAL_PORT}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );
      proxyReq.on('error', (err: Error) => {
        console.error('[livekit-proxy] twirp upstream error', err.message);
        if (!res.headersSent) res.status(502).json({ message: 'LiveKit SFU unreachable' });
      });
      if (body.length > 0) proxyReq.write(body);
      proxyReq.end();
    });
  });
}
