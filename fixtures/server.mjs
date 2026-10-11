import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCTS = {
  'GZ-MINI': { sku: 'GZ-MINI', name: 'Gizmo Mini', priceCents: 1999 },
  'GZ-PRO': { sku: 'GZ-PRO', name: 'Gizmo Pro', priceCents: 2999 },
};

function luhnCheck(numStr) {
  const sanitized = String(numStr || '').replace(/\D/g, '');
  if (sanitized.length < 13 || sanitized.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = sanitized.length - 1; i >= 0; i--) {
    let digit = parseInt(sanitized.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function createServer(variant) {
  let cart = [];
  let orders = [];
  let requests = [];

  const variantDir = path.join(__dirname, variant);

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Track request on finish
    res.on('finish', () => {
      requests.push({
        method,
        path: pathname,
        status: res.statusCode,
      });
    });

    // Handle APIs
    if (method === 'POST' && pathname === '/__reset') {
      cart = [];
      orders = [];
      requests = [];
      res.writeHead(204);
      return res.end();
    }

    if (method === 'GET' && pathname === '/__state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ orders, cart, requests }));
    }

    if (pathname === '/api/cart') {
      if (method === 'GET') {
        const items = cart.map(sku => PRODUCTS[sku] || { sku, name: 'Unknown', priceCents: 0 });
        const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ items, totalCents }));
      }

      if (method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (data.sku) {
              cart.push(data.sku);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count: cart.length }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid json' }));
          }
        });
        return;
      }
    }

    if (method === 'POST' && pathname === '/api/orders') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');

          // Buggy variant always returns 500 without creating order
          if (variant === 'shop-v2-bug') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'payment gateway timeout' }));
          }

          if (!luhnCheck(data.cardNumber)) {
            res.writeHead(402, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'card declined' }));
          }

          const items = cart.map(sku => PRODUCTS[sku] || { sku, name: 'Unknown', priceCents: 0 });
          const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0) || 1999;
          const sku = cart[0] || 'GZ-MINI';
          const cardLast4 = String(data.cardNumber || '').slice(-4);
          const orderId = `ord_${orders.length + 1}`;

          const newOrder = {
            id: orderId,
            email: data.email,
            sku,
            totalCents,
            status: 'PAID',
            cardLast4,
          };

          orders.push(newOrder);
          cart = [];

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ orderId }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid json' }));
        }
      });
      return;
    }

    // Serve HTML files
    let htmlFile = null;
    if (variant === 'shop-v1') {
      if (pathname === '/') htmlFile = 'index.html';
      else if (pathname === '/cart') htmlFile = 'cart.html';
      else if (pathname === '/checkout') htmlFile = 'checkout.html';
      else if (pathname === '/confirmation') htmlFile = 'confirmation.html';
    } else {
      if (pathname === '/') htmlFile = 'index.html';
      else if (pathname === '/bag') htmlFile = 'bag.html';
      else if (pathname === '/checkout/details') htmlFile = 'details.html';
      else if (pathname === '/checkout/payment') htmlFile = 'payment.html';
      else if (pathname === '/confirmation') htmlFile = 'confirmation.html';
    }

    if (htmlFile) {
      const fullPath = path.join(variantDir, htmlFile);
      fs.readFile(fullPath, (err, content) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return server;
}

export function startServer(variant, port, retries = 5) {
  return new Promise((resolve, reject) => {
    const s = createServer(variant);
    s.listen(port, '127.0.0.1', () => {
      const assignedPort = s.address().port;
      console.log(`LISTENING ${variant} ${assignedPort}`);
      resolve({ server: s, port: assignedPort, variant });
    });
    s.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        setTimeout(() => {
          startServer(variant, port, retries - 1).then(resolve, reject);
        }, 500);
      } else {
        reject(err);
      }
    });
  });
}

// CLI Execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--all')) {
    Promise.all([
      startServer('shop-v1', 4101),
      startServer('shop-v2', 4102),
      startServer('shop-v2-bug', 4103),
      startServer('shop-v2-ambiguous', 4104),
    ])
      .then(() => new Promise(() => {}))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else {
    let variant = 'shop-v1';
    let port = 0;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--variant' && args[i + 1]) {
        variant = args[i + 1];
        i++;
      } else if (args[i] === '--port' && args[i + 1]) {
        port = parseInt(args[i + 1], 10);
        i++;
      }
    }
    startServer(variant, port).catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}
