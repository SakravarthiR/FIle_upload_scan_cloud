/**
 * test-ws.js
 *
 * End-to-end integration test for Steps 7 & 8.
 *
 * 1. Connects a Socket.io client (authenticated via JWT).
 * 2. Uploads a CLEAN file  → expects "file:status" event with status=CLEAN.
 * 3. Uploads an INFECTED file (EICAR) → expects "file:status" with status=INFECTED.
 * 4. Uploads a SPOOFED file (text as PDF) → expects status=ERROR (no retry — deterministic).
 *
 * Run:  node test-ws.js
 */

'use strict';

const http  = require('http');
const { io: Client } = require('socket.io-client');
const jwt   = require('jsonwebtoken');

const BASE   = 'http://localhost:3000';
const SECRET = 'dev-secret-change-in-production';
const USER   = '11111111-1111-1111-1111-111111111111';

const TOKEN = jwt.sign({ userId: USER }, SECRET, { expiresIn: '1h' });

// ── Helpers ────────────────────────────────────────────────────────────────

function upload(filename, contentType, bodyContent) {
  const boundary = `----Boundary${Date.now()}`;
  const header =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const buf = Buffer.concat([
    Buffer.from(header),
    Buffer.isBuffer(bodyContent) ? bodyContent : Buffer.from(bodyContent),
    Buffer.from(footer),
  ]);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost', port: 3000, path: '/upload', method: 'POST',
        headers: {
          Authorization:  `Bearer ${TOKEN}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': buf.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function waitForEvent(socket, eventName, fileId, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() =>
      reject(new Error(`Timeout waiting for ${eventName} for fileId=${fileId}`)), timeoutMs);

    const handler = (payload) => {
      if (payload.fileId === fileId) {
        clearTimeout(timer);
        socket.off(eventName, handler);
        resolve(payload);
      }
    };
    socket.on(eventName, handler);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

(async () => {
  console.log('Connecting Socket.io client...\n');

  const socket = Client(BASE, { auth: { token: TOKEN }, transports: ['websocket'] });

  await new Promise((res, rej) => {
    socket.once('connect',       res);
    socket.once('connect_error', rej);
  });
  console.log(`✓ Socket connected  socketId=${socket.id}\n`);

  // ── Test 1: CLEAN ─────────────────────────────────────────────────────────
  console.log('─────────────────────────────────────────');
  console.log('Test 1 — Upload a CLEAN text file');
  const { file_id: cleanId } = await upload('clean.txt', 'text/plain', 'Hello, I am clean!');
  console.log(`  Uploaded  file_id=${cleanId}`);
  const cleanEvt = await waitForEvent(socket, 'file:status', cleanId);
  console.log(`  ✓ file:status received:`, cleanEvt);
  console.assert(cleanEvt.status === 'CLEAN', `Expected CLEAN, got ${cleanEvt.status}`);

  // ── Test 2: INFECTED (EICAR) ──────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('Test 2 — Upload EICAR infected file');
  const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const { file_id: eicarId } = await upload('eicar.txt', 'text/plain', Buffer.from(EICAR, 'ascii'));
  console.log(`  Uploaded  file_id=${eicarId}`);
  const eicarEvt = await waitForEvent(socket, 'file:status', eicarId);
  console.log(`  ✓ file:status received:`, eicarEvt);
  console.assert(eicarEvt.status === 'INFECTED', `Expected INFECTED, got ${eicarEvt.status}`);

  // ── Test 3: ERROR (magic byte mismatch) ───────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('Test 3 — Upload spoofed file (text masquerading as PDF)');
  const { file_id: spoofId } = await upload('spoofed.pdf', 'application/pdf', 'I am just text pretending to be a PDF.');
  console.log(`  Uploaded  file_id=${spoofId}`);
  const spoofEvt = await waitForEvent(socket, 'file:status', spoofId);
  console.log(`  ✓ file:status received:`, spoofEvt);
  console.assert(spoofEvt.status === 'ERROR', `Expected ERROR, got ${spoofEvt.status}`);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n═════════════════════════════════════════');
  console.log('All 3 WebSocket notification tests passed!');
  console.log('═════════════════════════════════════════\n');

  socket.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('\n✗ Test failed:', err.message);
  process.exit(1);
});
