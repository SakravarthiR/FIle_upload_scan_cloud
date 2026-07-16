/**
 * api/src/utils/mailer.js
 *
 * Nodemailer configuration for sending emails.
 */

'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

// In development, we use Ethereal Mail (a fake SMTP service) if real creds aren't provided
let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  // Use real SMTP if configured
  if (config.email.host && config.email.user && config.email.pass) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  } else {
    // Fallback: Ethereal test account (logs URL to terminal)
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('[Mailer] Using Ethereal Mail for testing. Check logs for preview URLs.');
  }

  return transporter;
}

/**
 * Send an OTP to the user's email.
 *
 * @param {string} to     Recipient email
 * @param {string} otp    6-digit OTP
 */
async function sendOtpEmail(to, otp) {
  const mailer = await getTransporter();

  const info = await mailer.sendMail({
    from: '"Bureau of File Inspection" <sakravarthisakravarthi01@gmail.com>',
    to,
    subject: 'Your Verification Code — Bureau of File Inspection',
    text: `Your clerk verification code is: ${otp}\n\nIt will expire in 10 minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 40px 20px; background-color: #f4ece4; font-family: 'Courier New', Courier, monospace; }
          .container { max-width: 500px; margin: 0 auto; background-color: #fbf8f1; border: 1px solid #d4c4b7; padding: 40px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { text-align: center; border-bottom: 2px solid #3c2f2f; padding-bottom: 20px; margin-bottom: 30px; }
          .title { color: #3c2f2f; font-size: 24px; font-weight: bold; font-style: italic; font-family: Georgia, serif; margin: 0; }
          .subtitle { color: #8b7355; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; }
          .content { color: #3c2f2f; font-size: 14px; line-height: 1.6; }
          .otp-box { text-align: center; background-color: #f0e6db; border: 1px dashed #8b7355; padding: 20px; margin: 30px 0; }
          .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3c2f2f; margin: 0; }
          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #8b7355; border-top: 1px solid #eaddd3; padding-top: 20px; letter-spacing: 1px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Bureau of File Inspection</h1>
            <p class="subtitle">Dept. of Digital Archives</p>
          </div>
          <div class="content">
            <p>Attention Clerk,</p>
            <p>Your enrolment requires identity verification. Please use the following telegraphic code to confirm your correspondence address.</p>
            
            <div class="otp-box">
              <p class="otp-code">${otp}</p>
            </div>
            
            <p style="font-size: 12px; color: #8b7355; text-align: center;">This code will expire in exactly 10 minutes.</p>
          </div>
          <div class="footer">
            CONFIDENTIAL — OFFICIAL USE ONLY<br>
            If you did not request this communication, please destroy immediately.
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (info.messageId && !config.email.host) {
    console.log(`[Mailer] Preview OTP Email: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

module.exports = { sendOtpEmail };
