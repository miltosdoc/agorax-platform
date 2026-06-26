/**
 * Transparent WebSocket + HTTP proxy that forwards LiveKit signaling
 * traffic from the Express server (port 5000) to the local LiveKit SFU
 * (port 7880).
 *
 *   Browser → wss://<replit-domain>/rtc?... → Express → ws://localhost:7880/rtc?...
 *   Browser → https://<replit-domain>/twirp/... → Express → http://localhost:7880/twirp/...
 *
 * The WebSocket leg uses a raw TCP tunnel (net.connect) so we never need
 * to parse or re-frame WebSocket messages — the bytes flow straight
 * through. The HTTP leg uses Node's built-in http.request.
 */

import { type Server as HttpServer, type IncomingMessage, request as httpRequest } from 'http';
import { connect as tcpConnect } from 'net';
import type { Express, Request, Response } from 'express';

const LIVEKIT_PORT = 7880;
const LIVEKIT_HOST = '127.0.0.1';

export function setupLiveKitProxy(server: HttpServer, app: Express): void {

  // ── WebSocket proxy: TCP tunnel (/rtc) ───────────────────────────────
  server.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
    const url = req.url ?? '';
    if (!url.startsWith('/rtc')) return;

    // Open a raw TCP connection to LiveKit
    const upstream = tcpConnect({ host: LIVEKIT_HOST, port: LIVEKIT_PORT }, () => {
      // Re-send the original HTTP upgrade request so LiveKit handles the handshake
      const headerLines = Object.entries(req.headers)
        .filter(([k]) => k !== 'host') // we'll override host
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\r\n');

      const requestLine = `${req.method ?? 'GET'} ${url} HTTP/1.1\r\n`;
      const hostHeader = `host: ${LIVEKIT_HOST}:${LIVEKIT_PORT}\r\n`;
      upstream.write(`${requestLine}${hostHeader}${headerLines}\r\n\r\n`);

      // Forward any bytes already buffered after the upgrade headers
      if (head && head.length > 0) upstream.write(head);

      // Bidirectional pipe — raw bytes flow through untouched
      socket.pipe(upstream);
      upstream.pipe(socket);
    });

    upstream.on('error', (err: Error) => {
      console.error('[livekit-proxy] ws upstream error', err.message);
      try { socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch { /* noop */ }
      socket.destroy();
    });

    socket.on('error', () => { upstream.destroy(); });
  });

  // ── HTTP proxy: /twirp ───────────────────────────────────────────────
  app.use('/twirp', (req: Request, res: Response) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const proxyReq = httpRequest(
        {
          hostname: LIVEKIT_HOST,
          port: LIVEKIT_PORT,
          path: `/twirp${req.path}${req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''}`,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${LIVEKIT_HOST}:${LIVEKIT_PORT}`,
          },
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
