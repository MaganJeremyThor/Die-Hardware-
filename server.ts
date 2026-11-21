import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { buildZipArchive, type ZipEntryInput } from './src/utils/zipBuilder.ts';
import { buildWindowsInstallerZip } from './src/utils/windowsInstaller.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

let cachedDistMtime = -1;
let cachedWwwZipGzBase64 = '';
let buildingPromise: Promise<void> | null = null;

function collectDistEntries(dir: string, rootDir: string, out: ZipEntryInput[]): void {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    const relPosix = path.relative(rootDir, fullPath).split(path.sep).join('/');
    // Exclude user conversation attachments or source maps from standalone installer bundle
    if (
      relPosix.startsWith('assets/aistudio/') ||
      relPosix === 'assets/aistudio' ||
      item.name === '.DS_Store' ||
      item.name.endsWith('.map')
    ) {
      continue;
    }
    if (item.isDirectory()) {
      collectDistEntries(fullPath, rootDir, out);
    } else if (item.isFile()) {
      const buf = fs.readFileSync(fullPath);
      out.push({
        name: relPosix,
        content: new Uint8Array(buf),
      });
    }
  }
}

async function ensureWwwBundleBase64(): Promise<string> {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    if (!buildingPromise) {
      buildingPromise = (async () => {
        const { build: buildVite } = await import('vite');
        await buildVite({ logLevel: 'warn' });
      })().finally(() => {
        buildingPromise = null;
      });
    }
    await buildingPromise;
  }

  if (!fs.existsSync(indexHtmlPath)) {
    return '';
  }

  const stat = fs.statSync(indexHtmlPath);
  if (cachedWwwZipGzBase64 && stat.mtimeMs === cachedDistMtime) {
    return cachedWwwZipGzBase64;
  }

  const entries: ZipEntryInput[] = [];
  collectDistEntries(distDir, distDir, entries);
  const innerZip = buildZipArchive(entries);
  const gzBuffer = zlib.gzipSync(Buffer.from(innerZip), { level: 9 });
  cachedWwwZipGzBase64 = gzBuffer.toString('base64');
  cachedDistMtime = stat.mtimeMs;
  return cachedWwwZipGzBase64;
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/installer-zip', async (req, res) => {
    try {
      const wwwZipGzBase64 = await ensureWwwBundleBase64();
      const envUrl =
        process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
          ? process.env.APP_URL
          : '';
      const forwardedProto = req.headers['x-forwarded-proto'];
      const proto =
        typeof forwardedProto === 'string' && forwardedProto.length > 0
          ? forwardedProto.split(',')[0].trim()
          : req.protocol || 'http';
      const host = req.get('host') || `localhost:${port}`;
      const appUrl = envUrl || `${proto}://${host}`;

      const zipBytes = buildWindowsInstallerZip(appUrl, wwwZipGzBase64);
      const payload = Buffer.from(zipBytes);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="Die-Hardware-Setup.zip"');
      res.setHeader('Content-Length', String(payload.length));
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).end(payload);
    } catch (error) {
      console.error('Failed to build Windows installer ZIP:', error);
      res.status(500).json({
        error: 'Failed to generate Die-Hardware-Setup.zip',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Die Hardware server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
