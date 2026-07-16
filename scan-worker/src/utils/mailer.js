/**
 * scan-worker/src/utils/mailer.js
 *
 * Scan-worker copy of the mailer utility.
 * Sends scan-result notification emails to the user who uploaded the file.
 */

'use strict';

const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || '587');

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('[Mailer] Using Ethereal Mail. Check logs for preview URLs.');
  }
  return transporter;
}

/**
 * Send scan result notification email.
 *
 * @param {string} to            Recipient email
 * @param {'CLEAN'|'INFECTED'|'ERROR'} status
 * @param {string} originalFilename
 * @param {object} [extra]       Virus name or error reason
 */
async function sendScanResultEmail(to, status, originalFilename, extra = {}) {
  const mailer = await getTransporter();

  const subjects = {
    CLEAN:    `File Cleared — ${originalFilename}`,
    INFECTED: `Threat Detected — ${originalFilename}`,
    ERROR:    `Scan Failed — ${originalFilename}`,
  };

  const colors   = { CLEAN: '#2d6a4f', INFECTED: '#c1121f', ERROR: '#7b4c00' };
  const labels   = { CLEAN: 'CLEARED FOR RELEASE', INFECTED: 'THREAT IDENTIFIED — QUARANTINED', ERROR: 'SCAN INCONCLUSIVE' };
  const messages = {
    CLEAN:    'Our inspectors have examined your submission and found no threats. The document has been cleared for download.',
    INFECTED: `Our inspectors have identified a threat in your submission.<br><strong>Threat signature:</strong> ${extra.virusName || 'Unknown'}.<br>The file has been quarantined and destroyed.`,
    ERROR:    `The scanning apparatus encountered an error while examining your file. Please re-submit or contact support.`,
  };

  const color   = colors[status]   || '#3c2f2f';
  const label   = labels[status]   || 'STATUS UNKNOWN';
  const message = messages[status] || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin:0; padding:40px 20px; background-color:#f4ece4; font-family:'Courier New',Courier,monospace; }
        .container { max-width:520px; margin:0 auto; background:#fbf8f1; border:1px solid #d4c4b7; padding:40px; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.06); }
        .header { text-align:center; border-bottom:2px solid #3c2f2f; padding-bottom:20px; margin-bottom:28px; }
        .title { color:#3c2f2f; font-size:22px; font-weight:bold; font-style:italic; font-family:Georgia,serif; margin:0; }
        .subtitle { color:#8b7355; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin-top:6px; }
        .stamp { text-align:center; border:3px solid ${color}; color:${color}; font-size:13px; font-weight:bold; letter-spacing:3px; text-transform:uppercase; padding:12px 20px; margin:24px 0; border-radius:2px; }
        .filename { background:#f0e6db; border:1px dashed #8b7355; padding:10px 16px; font-size:13px; color:#3c2f2f; word-break:break-all; margin:16px 0; }
        .content { font-size:13px; line-height:1.7; color:#3c2f2f; }
        .footer { margin-top:36px; text-align:center; font-size:10px; color:#8b7355; border-top:1px solid #eaddd3; padding-top:16px; letter-spacing:1px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="title">Bureau of File Inspection</h1>
          <p class="subtitle">Inspection Report — Dept. of Digital Archives</p>
        </div>
        <div class="stamp">${label}</div>
        <div class="content">
          <p>Regarding your submitted document:</p>
          <div class="filename">${originalFilename}</div>
          <p>${message}</p>
        </div>
        <div class="footer">
          CONFIDENTIAL — OFFICIAL USE ONLY<br>
          Bureau of File Inspection · Dept. of Digital Archives
        </div>
      </div>
    </body>
    </html>
  `;

  const info = await mailer.sendMail({
    from: '"Bureau of File Inspection" <noreply@bureau.gov>',
    to,
    subject: subjects[status] || `Scan Result — ${originalFilename}`,
    text: `Status: ${status}\nFile: ${originalFilename}\n${extra.virusName ? `Threat: ${extra.virusName}` : ''}`,
    html,
  });

  if (info.messageId && !process.env.SMTP_HOST) {
    console.log(`[Mailer] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

module.exports = { sendScanResultEmail };
