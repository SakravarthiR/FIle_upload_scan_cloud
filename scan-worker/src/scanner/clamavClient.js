/**
 * scan-worker/src/scanner/clamavClient.js
 *
 * Zero-dependency ClamAV client using the raw clamd TCP protocol.
 * Communicates with the clamd daemon (running in Docker on port 3310)
 * via the INSTREAM command — the file bytes are streamed over the TCP
 * socket so no shared filesystem volume is needed.
 *
 * Clamd protocol used here:
 *   PING              → "PONG\n"
 *   VERSION           → "ClamAV x.x.x/XXXXX/...\n"
 *   zINSTREAM\0       → stream chunks (4-byte BE length + data), then 4×0x00
 *                     → "stream: OK\0"  |  "stream: <VirusName> FOUND\0"
 *
 * All commands are sent null-terminated (z-prefix = zero-terminated).
 */

'use strict';

const net    = require('net');
const fs     = require('fs');
const config = require('../config');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Open a raw TCP socket to clamd and return it.
 * Rejects if the connection cannot be established within the timeout.
 *
 * @returns {Promise<import('net').Socket>}
 */
function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(
        `ClamAV connection timed out after ${config.clamav.connectTimeoutMs}ms ` +
        `(${config.clamav.host}:${config.clamav.port})`
      ));
    }, config.clamav.connectTimeoutMs);

    socket.connect(config.clamav.port, config.clamav.host, () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ClamAV socket error: ${err.message}`));
    });
  });
}

/**
 * Send a null-terminated command and collect the full response.
 *
 * @param {import('net').Socket} socket
 * @param {string} command  - e.g. 'zPING' (will have \0 appended)
 * @returns {Promise<string>}
 */
function sendCommand(socket, command) {
  return new Promise((resolve, reject) => {
    let response = '';

    socket.on('data',    (chunk) => { response += chunk.toString(); });
    socket.once('close', ()      => resolve(response.replace(/\0/g, '').trim()));
    socket.once('error', reject);

    socket.write(`${command}\0`);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify the clamd daemon is reachable.
 *
 * @returns {Promise<boolean>} true if PONG received
 */
async function ping() {
  const socket = await openSocket();
  const reply  = await sendCommand(socket, 'zPING');
  return reply === 'PONG';
}

/**
 * Retrieve the ClamAV engine + definition version string.
 *
 * @returns {Promise<string>}  e.g. "ClamAV 1.0.0/27234/Fri Jan  1 10:00:00 2025"
 */
async function version() {
  const socket = await openSocket();
  return sendCommand(socket, 'zVERSION');
}

/**
 * Scan a readable stream by sending it via the INSTREAM protocol.
 *
 * INSTREAM protocol:
 *   1. Send "zINSTREAM\0"
 *   2. For each chunk: write 4-byte big-endian uint32 (length) then the chunk bytes
 *   3. Write 4 zero bytes to signal end-of-stream
 *   4. Read clamd response: "stream: OK" or "stream: <VirusName> FOUND"
 *
 * @param {import('stream').Readable} readable
 * @returns {Promise<{ isInfected: boolean, virusName: string|null }>}
 */
function scanStream(readable) {
  return new Promise((resolve, reject) => {
    let socket;

    openSocket()
      .then((s) => {
        socket = s;

        // ── Set up scan timeout ────────────────────────────────────────────
        const scanTimer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`ClamAV scan timed out after ${config.clamav.scanTimeoutMs}ms`));
        }, config.clamav.scanTimeoutMs);

        // ── Collect response ───────────────────────────────────────────────
        let response = '';
        socket.on('data', (chunk) => { response += chunk.toString(); });
        socket.once('close', () => {
          clearTimeout(scanTimer);
          const clean = response.replace(/\0/g, '').trim();

          // "stream: OK"  OR  "stream: Eicar-Signature FOUND"
          if (clean.endsWith('OK')) {
            return resolve({ isInfected: false, virusName: null });
          }

          const match = clean.match(/^stream:\s+(.+)\s+FOUND$/i);
          if (match) {
            return resolve({ isInfected: true, virusName: match[1].trim() });
          }

          // Unexpected — treat as error
          reject(new Error(`Unexpected clamd response: ${clean}`));
        });
        socket.once('error', (err) => {
          clearTimeout(scanTimer);
          reject(new Error(`ClamAV socket error during scan: ${err.message}`));
        });

        // ── Send INSTREAM command ──────────────────────────────────────────
        socket.write('zINSTREAM\0');

        // ── Pipe readable in chunks ────────────────────────────────────────
        const chunkSize = config.clamav.chunkSize;  // 64 KiB default
        const lenBuf    = Buffer.allocUnsafe(4);

        readable.on('data', (chunk) => {
          lenBuf.writeUInt32BE(chunk.length, 0);
          socket.write(lenBuf);
          socket.write(chunk);
        });

        readable.once('end', () => {
          // Signal end-of-stream to clamd (4 zero bytes)
          socket.write(Buffer.alloc(4));
        });

        readable.once('error', (err) => {
          clearTimeout(scanTimer);
          socket.destroy();
          reject(new Error(`File read error during scan: ${err.message}`));
        });
      })
      .catch(reject);
  });
}

/**
 * Convenience wrapper: scan a file on disk by path.
 *
 * @param {string} filePath  Absolute path to the file
 * @returns {Promise<{ isInfected: boolean, virusName: string|null }>}
 */
async function scanFile(filePath) {
  const readable = fs.createReadStream(filePath, {
    highWaterMark: config.clamav.chunkSize,
  });
  return scanStream(readable);
}

module.exports = { ping, version, scanFile, scanStream };
