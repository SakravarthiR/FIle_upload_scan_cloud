/**
 * test-infected.js
 *
 * Simulates uploading an infected file by generating the EICAR signature in memory
 * and posting it directly to the local upload API using standard HTTP request.
 * This avoids saving the EICAR signature to a physical file on the Windows disk,
 * which Windows Defender would block from being read by curl.
 */

'use strict';

const http = require('http');
const jwt  = require('jsonwebtoken');

const TOKEN = jwt.sign(
  { userId: '11111111-1111-1111-1111-111111111111' },
  'dev-secret-change-in-production',
  { expiresIn: '1h' }
);

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// Construct multipart body manually to keep it zero-dependency
const boundary = '----WebKitFormBoundaryEICARTest';
const filename = 'test_infected.txt';

const header = 
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
  `Content-Type: text/plain\r\n\r\n`;

const footer = `\r\n--${boundary}--\r\n`;

const bodyBuffer = Buffer.concat([
  Buffer.from(header, 'utf8'),
  Buffer.from(EICAR, 'ascii'),
  Buffer.from(footer, 'utf8')
]);

const req = http.request(
  {
    hostname: 'localhost',
    port:     3000,
    path:     '/upload',
    method:   'POST',
    headers:  {
      'Authorization':   `Bearer ${TOKEN}`,
      'Content-Type':     `multipart/form-data; boundary=${boundary}`,
      'Content-Length':   bodyBuffer.length,
    }
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Response Status:', res.statusCode);
      console.log('Response Body:', JSON.stringify(JSON.parse(data), null, 2));

      const parsed = JSON.parse(data);
      if (parsed.file_id) {
        console.log('\nUploaded file_id:', parsed.file_id);
        console.log('Waiting 5 seconds for scan to complete...\n');
        setTimeout(() => queryStatus(parsed.file_id), 5000);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('Request failed:', err.message);
});

req.write(bodyBuffer);
req.end();

function queryStatus(fileId) {
  http.get(
    {
      hostname: 'localhost',
      port:     3000,
      path:     `/status/${fileId}`,
      headers:  {
        'Authorization': `Bearer ${TOKEN}`,
      }
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('=== Scan Result from GET /status/:fileId ===');
        console.log(JSON.stringify(JSON.parse(data), null, 2));
      });
    }
  );
}
