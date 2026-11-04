import { createLocalDatabase } from './sqlite-database.mjs';
import { localApiKey } from './env.mjs';
import http from 'node:http';
import { Readable } from 'node:stream';
import worker from '../dist/server/index.js';
const DB = createLocalDatabase();
const key = localApiKey();
http
  .createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const x of req) chunks.push(x);
      const request = new Request('http://localhost:4173' + req.url, {
        method: req.method,
        headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }),
      });
      const response = await worker.fetch(
        request,
        { DB, OPENAI_API_KEY: key },
        { waitUntil: (p) => p.catch(() => {}) },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
    } catch (e) {
      console.error(e.message);
      res.writeHead(500);
      res.end('Preview error');
    }
  })
  .listen(4173, () => console.log('Local: http://localhost:4173'));
