// Node connection parity harness. Serves the test page, collects the
// page's report JSON, writes it to REPORT_PATH.
import http from 'node:http';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('./conn-pages/node-conn.html', import.meta.url), 'utf8');
const out = process.env.REPORT_PATH || '/tmp/conn-report.json';
const port = parseInt(process.env.PORT_APP || '3999', 10);
http.createServer((req, res) => {
  if (req.url === '/report' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      fs.writeFileSync(out, JSON.stringify(JSON.parse(body || '{}'), null, 2));
      res.writeHead(204); res.end();
    });
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }
}).listen(port, '127.0.0.1');
console.log(`harness on 127.0.0.1:${port} -> ${out}`);
