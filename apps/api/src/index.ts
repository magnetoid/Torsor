import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { hashPassword, requireAuth, sanitizeUserById, signAccessToken, verifyPassword, type AuthenticatedRequest, type UserRole } from './auth.js';
import { close as closeDb, checkHealth as checkDatabaseHealth, pool, query } from './db.js';
import { logger } from './logger.js';
import { runMigrations } from './migrations/run.js';
import { healthCheck as checkRedisHealth, connect as connectRedis, disconnect as disconnectRedis, getRedisClient } from './redis.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const port = Number.parseInt(process.env.PORT ?? process.env.API_PORT ?? '3001', 10);
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const corsOrigin = process.env.CORS_ORIGIN ?? '';
const devSeedEmail = process.env.DEV_SEED_EMAIL ?? 'demo@torsor.local';
const devSeedPassword = process.env.DEV_SEED_PASSWORD ?? 'demo12345';
const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryForever(label: string, fn: () => Promise<void>) {
  let attempt = 0;
  let delayMs = 500;
  while (true) {
    try {
      await fn();
      return;
    } catch (error) {
      attempt += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ attempt, err: message }, `${label} failed, retrying`);
      await sleep(delayMs);
      delayMs = Math.min(15_000, Math.round(delayMs * 1.5));
    }
  }
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(pinoHttp({ logger, customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info') }));
app.use(
  cors({
    origin: corsOrigin
      ? corsOrigin
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : true,
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '2mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT ?? '20', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, slow down.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number.parseInt(process.env.API_RATE_LIMIT ?? '300', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

const mapProject = (row: any) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description,
  vibe: row.vibe,
  isPublic: row.is_public,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProjectFile = (row: any) => ({
  id: row.id,
  projectId: row.project_id,
  filename: row.filename,
  language: row.language,
  content: row.content,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function resolveRole(email: string, dbRole: UserRole | null | undefined): UserRole {
  if (dbRole === 'super_admin' || dbRole === 'admin') return dbRole;
  if (superAdminEmails.includes(email.toLowerCase())) return 'super_admin';
  return dbRole ?? 'user';
}

const roleRank: Record<UserRole, number> = { user: 0, admin: 1, super_admin: 2 };

interface AdminRequest extends AuthenticatedRequest {
  role?: UserRole;
}

// requireRole gates a route on the caller's effective role (DB role + SUPER_ADMIN_EMAILS).
// Must run after requireAuth. Returns 403 when the caller's rank is below the minimum.
function requireRole(minimum: UserRole) {
  return async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await sanitizeUserById(req.auth!.userId);
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      const role = resolveRole(user.email, user.role);
      if (roleRank[role] < roleRank[minimum]) {
        res.status(403).json({ error: 'Forbidden: insufficient role' });
        return;
      }
      req.role = role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function syncSuperAdmins(): Promise<void> {
  if (superAdminEmails.length === 0) return;
  await query(
    `UPDATE users
       SET role = 'super_admin', updated_at = NOW()
     WHERE LOWER(email) = ANY($1::text[]) AND role <> 'super_admin'`,
    [superAdminEmails],
  );
}

async function ensureDevSeedUser(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1 LIMIT 1', [devSeedEmail]);
  if (existing.rows[0]) return;

  const passwordHash = await hashPassword(devSeedPassword);
  await query(
    `INSERT INTO users (email, username, password_hash, bio)
     VALUES ($1, $2, $3, $4)`,
    [devSeedEmail, 'demo', passwordHash, 'Local seeded demo user'],
  );
}

async function issueAuthResponse(userId: string) {
  const user = await sanitizeUserById(userId);
  if (!user) {
    throw new Error('User not found after authentication');
  }

  const sessionId = crypto.randomUUID();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, user.id, tokenHash, expiresAt.toISOString()],
  );

  const token = signAccessToken({ userId: user.id, email: user.email, sessionId });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.username,
      avatarUrl: user.avatarUrl,
      role: resolveRole(user.email, user.role),
      onboarded: true,
      createdAt: user.createdAt,
    },
  };
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'torsor-api', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  const [database, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  const ready = database && redis;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', timestamp: new Date().toISOString(), dependencies: { database, redis } });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'torsor-api',
    version: 'v1',
    appUrl,
    endpoints: {
      health: '/health',
      ready: '/ready',
      auth: '/api/v1/auth',
      projects: '/api/v1/projects',
      tasks: '/api/v1/tasks',
      config: '/api/v1/config',
    },
  });
});

app.get('/api/v1/config', (_req, res) => {
  res.json({
    appUrl,
    apiUrl: process.env.VITE_API_URL ?? `http://localhost:${port}`,
    features: {
      auth: 'jwt-password',
      projects: 'db-backed',
      files: 'db-backed',
      backgroundJobs: 'skeleton',
    },
    domain: {
      app: 'app.torsor.dev',
      landing: 'torsor.dev',
      note: 'App traffic should target app.torsor.dev and leave torsor.dev landing untouched.',
    },
    devSeedUser: process.env.NODE_ENV === 'development' ? { email: devSeedEmail, password: devSeedPassword } : undefined,
  });
});

app.post('/api/v1/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name || !email || !password || password.length < 8) {
      res.status(400).json({ error: 'name, email, and password (min 8 chars) are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [normalizedEmail]);
    if (existing.rows[0]) {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const usernameBase = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || normalizedEmail.split('@')[0];
    const username = `${usernameBase}-${crypto.randomBytes(3).toString('hex')}`;
    const initialRole: UserRole = superAdminEmails.includes(normalizedEmail) ? 'super_admin' : 'user';

    const result = await query<{ id: string }>(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [normalizedEmail, username, passwordHash, initialRole],
    );

    res.status(201).json(await issueAuthResponse(result.rows[0].id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    const result = await query<{ id: string; email: string; password_hash: string }>(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email.toLowerCase()],
    );

    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json(await issueAuthResponse(user.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/logout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.auth?.sessionId) {
      await query('DELETE FROM sessions WHERE id = $1', [req.auth.sessionId]);
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/auth/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await sanitizeUserById(req.auth!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.username,
        avatarUrl: user.avatarUrl,
        role: resolveRole(user.email, user.role),
        onboarded: true,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/projects', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await query(
      `SELECT id, user_id, name, description, vibe, is_public, created_at, updated_at
       FROM projects
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.auth!.userId],
    );
    res.json({ items: result.rows.map(mapProject) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/projects', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { name, description, vibe, isPublic } = req.body as { name?: string; description?: string; vibe?: string; isPublic?: boolean };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    const result = await query(
      `INSERT INTO projects (user_id, name, description, vibe, is_public)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, name, description, vibe, is_public, created_at, updated_at`,
      [req.auth!.userId, name.trim(), description?.trim() || null, vibe || 'builder', Boolean(isPublic)],
    );

    const project = result.rows[0];
    await query(
      `INSERT INTO project_files (project_id, filename, language, content)
       VALUES ($1, 'README.md', 'markdown', $2)
       ON CONFLICT (project_id, filename) DO NOTHING`,
      [project.id, `# ${project.name}\n\nCreated in Torsor Phase 2.`],
    );

    res.status(201).json(mapProject(project));
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/projects/:projectId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await query(
      `SELECT id, user_id, name, description, vibe, is_public, created_at, updated_at
       FROM projects
       WHERE id = $1 AND user_id = $2`,
      [req.params.projectId, req.auth!.userId],
    );

    const project = result.rows[0];
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(mapProject(project));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/projects/:projectId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const current = await query(
      `SELECT id, user_id, name, description, vibe, is_public, created_at, updated_at
       FROM projects
       WHERE id = $1 AND user_id = $2`,
      [req.params.projectId, req.auth!.userId],
    );

    const project = current.rows[0];
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const { name, description, vibe, isPublic } = req.body as { name?: string; description?: string; vibe?: string; isPublic?: boolean };
    const updated = await query(
      `UPDATE projects
       SET name = $3,
           description = $4,
           vibe = $5,
           is_public = $6,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, name, description, vibe, is_public, created_at, updated_at`,
      [req.params.projectId, req.auth!.userId, name ?? project.name, description ?? project.description, vibe ?? project.vibe, isPublic ?? project.is_public],
    );

    res.json(mapProject(updated.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/projects/:projectId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.auth!.userId]);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/projects/:projectId/files', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const projectAccess = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.auth!.userId]);
    if (!projectAccess.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await query(
      `SELECT id, project_id, filename, language, content, version, created_at, updated_at
       FROM project_files
       WHERE project_id = $1
       ORDER BY updated_at DESC, filename ASC`,
      [req.params.projectId],
    );

    res.json({ items: result.rows.map(mapProjectFile) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/projects/:projectId/files', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { filename, language, content } = req.body as { filename?: string; language?: string; content?: string };
    if (!filename?.trim()) {
      res.status(400).json({ error: 'filename is required' });
      return;
    }

    const projectAccess = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.auth!.userId]);
    if (!projectAccess.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await query(
      `INSERT INTO project_files (project_id, filename, language, content, version)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (project_id, filename)
       DO UPDATE SET language = EXCLUDED.language,
                     content = EXCLUDED.content,
                     version = project_files.version + 1,
                     updated_at = NOW()
       RETURNING id, project_id, filename, language, content, version, created_at, updated_at`,
      [req.params.projectId, filename.trim(), language || null, content || ''],
    );

    res.status(201).json(mapProjectFile(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/projects/:projectId/files/:fileId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { filename, language } = req.body as { filename?: string; language?: string };
    if (filename !== undefined && !filename.trim()) {
      res.status(400).json({ error: 'filename cannot be empty' });
      return;
    }

    const projectAccess = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.auth!.userId]);
    if (!projectAccess.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const current = await query(
      `SELECT id, project_id, filename, language, content, version, created_at, updated_at
       FROM project_files
       WHERE id = $1 AND project_id = $2`,
      [req.params.fileId, req.params.projectId],
    );
    const file = current.rows[0];
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    try {
      const updated = await query(
        `UPDATE project_files
         SET filename = $3,
             language = $4,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, filename, language, content, version, created_at, updated_at`,
        [req.params.fileId, req.params.projectId, filename?.trim() ?? file.filename, language ?? file.language],
      );
      res.json(mapProjectFile(updated.rows[0]));
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'A file with that name already exists' });
        return;
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

app.delete('/api/v1/projects/:projectId/files/:fileId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const projectAccess = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.projectId, req.auth!.userId]);
    if (!projectAccess.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await query(
      'DELETE FROM project_files WHERE id = $1 AND project_id = $2 RETURNING id',
      [req.params.fileId, req.params.projectId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/tasks', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await query(
      `SELECT t.id, t.project_id, t.task_type, t.status, t.prompt, t.result, t.error, t.created_at, t.updated_at
       FROM ai_tasks t
       INNER JOIN projects p ON p.id = t.project_id
       WHERE p.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [req.auth!.userId],
    );

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/tasks', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { projectId, prompt, taskType = 'generate' } = req.body as { projectId?: string; prompt?: string; taskType?: string };
    if (!projectId || !prompt) {
      res.status(400).json({ error: 'projectId and prompt are required' });
      return;
    }

    const projectAccess = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, req.auth!.userId]);
    if (!projectAccess.rows[0]) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const result = await query(
      `INSERT INTO ai_tasks (project_id, task_type, prompt, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, project_id, task_type, status, prompt, created_at, updated_at`,
      [projectId, taskType, prompt],
    );

    const task = result.rows[0];
    try {
      await getRedisClient().publish('torsor:jobs', JSON.stringify({ taskId: task.id }));
    } catch (err) {
      logger.warn({ err }, 'redis publish failed, polling worker will pick up task');
    }

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

// --- Admin / super-admin platform dashboard ---

app.get('/api/v1/admin/stats', requireAuth, requireRole('admin'), async (_req: AdminRequest, res, next) => {
  try {
    const [users, projects, files, sessions, tasks, newUsers7d, newProjects7d] = await Promise.all([
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM users'),
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM projects'),
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM project_files'),
      query<{ c: number }>('SELECT COUNT(*)::int AS c FROM sessions WHERE expires_at > NOW()'),
      query<{ status: string; c: number }>('SELECT status, COUNT(*)::int AS c FROM ai_tasks GROUP BY status'),
      query<{ c: number }>("SELECT COUNT(*)::int AS c FROM users WHERE created_at > NOW() - INTERVAL '7 days'"),
      query<{ c: number }>("SELECT COUNT(*)::int AS c FROM projects WHERE created_at > NOW() - INTERVAL '7 days'"),
    ]);

    const tasksByStatus = Object.fromEntries(tasks.rows.map((row) => [row.status, row.c]));

    res.json({
      totals: {
        users: users.rows[0].c,
        projects: projects.rows[0].c,
        files: files.rows[0].c,
        activeSessions: sessions.rows[0].c,
        tasks: tasks.rows.reduce((sum, row) => sum + row.c, 0),
      },
      tasksByStatus,
      growth: {
        newUsers7d: newUsers7d.rows[0].c,
        newProjects7d: newProjects7d.rows[0].c,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/admin/users', requireAuth, requireRole('admin'), async (req: AdminRequest, res, next) => {
  try {
    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const filterParams: unknown[] = [];
    let where = '';
    if (search) {
      filterParams.push(`%${search}%`);
      where = 'WHERE LOWER(u.email) LIKE $1 OR LOWER(u.username) LIKE $1';
    }

    const listParams = [...filterParams, limit, offset];
    const result = await query<{
      id: string;
      email: string;
      username: string;
      role: UserRole | null;
      avatar_url: string | null;
      created_at: string;
      project_count: number;
      last_active_at: string | null;
    }>(
      `SELECT u.id, u.email, u.username, u.role, u.avatar_url, u.created_at,
              COUNT(p.id)::int AS project_count,
              (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
       FROM users u
       LEFT JOIN projects p ON p.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );

    const totalResult = await query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM users u ${where}`,
      filterParams,
    );

    res.json({
      items: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        username: row.username,
        role: resolveRole(row.email, row.role),
        avatarUrl: row.avatar_url,
        projectCount: row.project_count,
        lastActiveAt: row.last_active_at,
        createdAt: row.created_at,
      })),
      total: totalResult.rows[0].c,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/v1/admin/users/:userId/role', requireAuth, requireRole('super_admin'), async (req: AdminRequest, res, next) => {
  try {
    const { role } = req.body as { role?: string };
    const allowed: UserRole[] = ['user', 'admin', 'super_admin'];
    if (!role || !allowed.includes(role as UserRole)) {
      res.status(400).json({ error: 'role must be one of user, admin, super_admin' });
      return;
    }
    // Guard against a super-admin accidentally locking themselves out.
    if (req.params.userId === req.auth!.userId && role !== 'super_admin') {
      res.status(400).json({ error: 'You cannot remove your own super_admin role' });
      return;
    }

    const result = await query<{ id: string; email: string; username: string; role: UserRole; created_at: string }>(
      `UPDATE users SET role = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, username, role, created_at`,
      [req.params.userId, role],
    );

    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: resolveRole(user.email, user.role),
      createdAt: user.created_at,
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  (req as any).log?.error({ err }, 'request error');
  res.status(500).json({ error: 'Internal Server Error', message: isProduction ? undefined : message });
});

async function start() {
  await retryForever('postgres connect', async () => {
    await query('SELECT 1');
  });

  await retryForever('redis connect', async () => {
    await connectRedis();
  });

  await retryForever('migrations', async () => {
    await runMigrations(pool);
  });

  await retryForever('super-admin sync', async () => {
    await syncSuperAdmins();
  });

  await retryForever('dev seed', async () => {
    await ensureDevSeedUser();
  });

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'torsor-api listening');
  });

  // Periodically reap expired session rows so the table stays bounded.
  const sessionCleanup = setInterval(() => {
    query('DELETE FROM sessions WHERE expires_at <= NOW()').catch((err) => {
      logger.warn({ err }, 'expired session cleanup failed');
    });
  }, 60 * 60 * 1000);
  sessionCleanup.unref();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    clearInterval(sessionCleanup);
    server.close();
    try { await disconnectRedis(); } catch (err) { logger.warn({ err }, 'redis disconnect failed'); }
    try { await closeDb(); } catch (err) { logger.warn({ err }, 'db close failed'); }
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

void start();
