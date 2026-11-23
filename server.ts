import { spawn, type ChildProcess } from 'child_process';
import express, { type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const PYTHON_PORT = Number(process.env.PYTHON_PORT || 5001);

let pythonProc: ChildProcess | null = null;

function startPythonBackend(): void {
  const scriptPath = path.join(__dirname, 'backend', 'run.py');
  pythonProc = spawn('python3', [scriptPath, '--host', '127.0.0.1', '--port', String(PYTHON_PORT)], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProc.stdout?.on('data', (chunk) => {
    process.stdout.write(`[python] ${chunk}`);
  });
  pythonProc.stderr?.on('data', (chunk) => {
    process.stderr.write(`[python] ${chunk}`);
  });
  pythonProc.on('exit', (code) => {
    console.error(`[python] exited with code ${code}`);
    pythonProc = null;
  });
}

function waitForPythonHealth(retries = 40, delayMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const probe = () => {
      attempts += 1;
      const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < retries) {
          setTimeout(probe, delayMs);
        } else {
          reject(new Error(`Python backend returned status ${res.statusCode}`));
        }
      });
      req.on('error', () => {
        if (attempts < retries) {
          setTimeout(probe, delayMs);
        } else {
          reject(new Error('Timed out waiting for Python scheduling backend'));
        }
      });
    };
    probe();
  });
}

function proxyApiRequest(req: Request, res: Response): void {
  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: PYTHON_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PYTHON_PORT}`,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Backend proxy error: ${err.message}` });
    }
  });

  req.pipe(proxyReq, { end: true });
}

async function bootstrap() {
  startPythonBackend();
  await waitForPythonHealth();

  const app = express();

  app.use('/api', (req, res) => {
    proxyApiRequest(req, res);
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Adaptive CPU Scheduler full-stack server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    server.close();
    if (pythonProc) {
      pythonProc.kill('SIGTERM');
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  if (pythonProc) pythonProc.kill('SIGTERM');
  process.exit(1);
});
