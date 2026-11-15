import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_ROUTES = [
  ['/api/notes-introduction', path.resolve(__dirname, 'notes-introduction')],
  ['/api/notes-plan', path.resolve(__dirname, 'notes-plan')],
  ['/api/notes-develop', path.resolve(__dirname, 'notes-develop')],
  ['/api/notes-review', path.resolve(__dirname, 'notes-review')],
  ['/api/notes-administration', path.resolve(__dirname, 'notes-administration')],
  ['/api/notes-extended', path.resolve(__dirname, 'notes-extended')],
  ['/api/notes', path.resolve(__dirname, 'notes')],
];

function sanitizeSlug(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) {
    throw new Error('Invalid note slug');
  }
  return cleaned;
}

function resolveSafeNotePath(baseDir, slug) {
  const safe = sanitizeSlug(slug);
  const fullPath = path.resolve(baseDir, `${safe}.md`);
  if (!fullPath.startsWith(baseDir + path.sep)) {
    throw new Error('Unsafe path rejected');
  }
  return { safeSlug: safe, fullPath };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function matchVaultRoute(pathname) {
  for (const [prefix, dir] of VAULT_ROUTES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return { prefix, dir };
    }
  }
  return null;
}

function notesApiMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const matched = matchVaultRoute(url.pathname);
    if (!matched) {
      return next();
    }

    const { prefix, dir: vaultDir } = matched;

    try {
      await fs.mkdir(vaultDir, { recursive: true });

      if (req.method === 'GET' && url.pathname === prefix) {
        const entries = await fs.readdir(vaultDir, { withFileTypes: true });
        const mdFiles = entries
          .filter((e) => e.isFile() && e.name.endsWith('.md'))
          .sort((a, b) => a.name.localeCompare(b.name));

        const notes = await Promise.all(
          mdFiles.map(async (entry) => {
            const slug = entry.name.slice(0, -3);
            const raw = await fs.readFile(path.join(vaultDir, entry.name), 'utf8');
            return { slug, raw };
          })
        );
        return sendJson(res, 200, { writable: true, notes });
      }

      if (req.method === 'POST' && url.pathname === `${prefix}/batch`) {
        const body = await readRequestBody(req);
        const writes = Array.isArray(body.notes) ? body.notes : [];
        const deletes = Array.isArray(body.deleteSlugs) ? body.deleteSlugs : [];

        for (const oldSlug of deletes) {
          const { fullPath } = resolveSafeNotePath(vaultDir, oldSlug);
          await fs.rm(fullPath, { force: true });
        }

        for (const item of writes) {
          const { fullPath } = resolveSafeNotePath(vaultDir, item.slug);
          await fs.writeFile(fullPath, String(item.raw ?? ''), 'utf8');
        }

        return sendJson(res, 200, { ok: true, written: writes.length, deleted: deletes.length });
      }

      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const itemMatch = url.pathname.match(new RegExp(`^${escapedPrefix}/([^/]+)$`));
      if (itemMatch) {
        const rawSlug = decodeURIComponent(itemMatch[1]);
        const { safeSlug, fullPath } = resolveSafeNotePath(vaultDir, rawSlug);

        if (req.method === 'PUT') {
          const body = await readRequestBody(req);
          if (body.previousSlug && body.previousSlug !== safeSlug) {
            const prev = resolveSafeNotePath(vaultDir, body.previousSlug);
            if (prev.fullPath !== fullPath) {
              await fs.rm(prev.fullPath, { force: true });
            }
          }
          await fs.writeFile(fullPath, String(body.raw ?? ''), 'utf8');
          return sendJson(res, 200, { ok: true, slug: safeSlug });
        }

        if (req.method === 'DELETE') {
          await fs.rm(fullPath, { force: true });
          return sendJson(res, 200, { ok: true, slug: safeSlug });
        }
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Request failed' });
    }
  };
}

function localNotesPlugin() {
  return {
    name: 'zettelkasten-local-notes-api',
    configureServer(server) {
      // Disable Vite full-reload when we save vault .md files via the UI editor
      for (const [, vaultDir] of VAULT_ROUTES) {
        server.watcher.unwatch(path.join(vaultDir, '**'));
      }
      server.middlewares.use(notesApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(notesApiMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [localNotesPlugin()],
  server: {
    port: 5179,
    strictPort: false,
  },
});
