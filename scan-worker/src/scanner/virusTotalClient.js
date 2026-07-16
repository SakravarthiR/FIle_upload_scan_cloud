/**
 * scan-worker/src/scanner/virusTotalClient.js
 *
 * VirusTotal API v3 integration.
 *
 * Flow:
 *   1. Hash the file (SHA-256) and check if VT already has a report.
 *   2. If no existing report, upload the file for a full scan.
 *   3. Poll for the analysis report until completion (max 90 seconds).
 *   4. Parse the result into a standard { isClean, detectionRatio, detections } shape.
 *
 * Security notes:
 *   - API key is read from env only, never hardcoded.
 *   - Files are streamed to VT over HTTPS.
 *   - VT results are advisory — ClamAV is still the primary gate.
 */

'use strict';

const fs    = require('fs');
const https = require('https');
const path  = require('path');
const FormData = require('form-data');
const axios = require('axios');

const VT_API_KEY  = process.env.VIRUSTOTAL_API_KEY || '';
const VT_BASE_URL = 'https://www.virustotal.com/api/v3';
const POLL_INTERVAL_MS = 5000;  // 5 seconds between polls
const POLL_TIMEOUT_MS  = 90000; // 90 second max wait

/**
 * Check if VT is configured (API key present).
 * @returns {boolean}
 */
function isEnabled() {
  return !!VT_API_KEY;
}

/**
 * Build axios instance with VT auth header.
 */
function vtAxios() {
  return axios.create({
    baseURL: VT_BASE_URL,
    headers: { 'x-apikey': VT_API_KEY },
    timeout: 30_000,
  });
}

/**
 * Check VT for an existing report by SHA-256 hash.
 * Returns null if no report exists yet.
 *
 * @param {string} sha256
 * @returns {Promise<object|null>}
 */
async function getReportByHash(sha256) {
  try {
    const client = vtAxios();
    const res = await client.get(`/files/${sha256}`);
    return res.data?.data ?? null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Upload a file to VirusTotal for scanning.
 *
 * @param {string} filePath
 * @returns {Promise<string>} analysis ID
 */
async function uploadFile(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
  });

  const client = vtAxios();
  const res = await client.post('/files', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
  });

  return res.data?.data?.id;
}

/**
 * Poll for an analysis result until it reaches 'completed' state.
 *
 * @param {string} analysisId
 * @returns {Promise<object>} VT analysis data
 */
async function pollAnalysis(analysisId) {
  const client  = vtAxios();
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await client.get(`/analyses/${analysisId}`);
    const status = res.data?.data?.attributes?.status;

    if (status === 'completed') {
      return res.data.data;
    }

    // Wait before polling again
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('VirusTotal analysis timed out after 90 seconds.');
}

/**
 * Parse VT analysis into a standardised result object.
 *
 * @param {object} analysis
 * @returns {{ isClean: boolean, detectionRatio: string, detections: string[] }}
 */
function parseAnalysis(analysis) {
  const stats  = analysis?.attributes?.stats || {};
  const results = analysis?.attributes?.results || {};

  const malicious   = stats.malicious   || 0;
  const suspicious  = stats.suspicious  || 0;
  const undetected  = stats.undetected  || 0;
  const harmless    = stats.harmless    || 0;

  const total      = malicious + suspicious + undetected + harmless;
  const detections = Object.entries(results)
    .filter(([, v]) => v.category === 'malicious' || v.category === 'suspicious')
    .map(([engine, v]) => `${engine}: ${v.result}`);

  return {
    isClean:         malicious === 0 && suspicious === 0,
    detectionRatio:  `${malicious + suspicious}/${total}`,
    detections,
    rawStats:        stats,
  };
}

/**
 * Main entry point — scan a file via VirusTotal.
 *
 * @param {string} filePath      Local path to the file
 * @param {string} sha256Hash    Pre-computed SHA-256 hash
 * @returns {Promise<{ isClean: boolean, detectionRatio: string, detections: string[], skipped: boolean }>}
 */
async function scanFile(filePath, sha256Hash) {
  if (!isEnabled()) {
    return { skipped: true, isClean: true, detectionRatio: 'N/A', detections: [] };
  }

  try {
    // 1. Check for existing report (avoid re-uploading known files)
    let report = await getReportByHash(sha256Hash);
    let analysisId;

    if (!report) {
      // 2. Upload for fresh scan
      console.log('[VT] No existing report — uploading for scan...');
      analysisId = await uploadFile(filePath);
      console.log(`[VT] Uploaded, analysis ID: ${analysisId}`);

      // 3. Poll until done
      report = await pollAnalysis(analysisId);
    } else {
      console.log('[VT] Found existing report for this hash.');
    }

    // 4. Parse and return
    const result = parseAnalysis(report);
    console.log(`[VT] Result: ${result.detectionRatio} engines detected threats. Clean=${result.isClean}`);
    return { ...result, skipped: false };

  } catch (err) {
    console.error(`[VT] VirusTotal scan failed (non-fatal): ${err.message}`);
    // VT failure is non-fatal — ClamAV is the primary scanner
    return { skipped: true, isClean: true, detectionRatio: 'error', detections: [], error: err.message };
  }
}

module.exports = { scanFile, isEnabled };
