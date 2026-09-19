const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  console.log('Request:', url);
  
  // Default to index.html
  if (url === '/' || url === '') {
    url = '/index.html';
  }
  
  // If no extension, try adding .html first, then fallback to index.html
  if (!path.extname(url)) {
    const htmlPath = path.join(ROOT, url + '.html');
    if (fs.existsSync(htmlPath)) {
      url = url + '.html';
    } else {
      url = '/index.html';
    }
  }
  
  const filePath = path.join(ROOT, url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      // Fallback to index.html
      fs.readFile(path.join(ROOT, 'index.html'), (err2, content2) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not Found: ' + url);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content2);
        }
      });
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
