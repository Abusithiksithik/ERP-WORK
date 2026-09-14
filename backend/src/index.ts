import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { pool } from './config/db';
import dotenv from 'dotenv';
// import { pool } from './config/db';

import { hashPassword } from './utils/bcrypt';

dotenv.config();

// Routes
import authRoutes             from './routes/auth.routes';
import usersRoutes            from './routes/users.routes';
import studentsRoutes         from './routes/students.routes';
import categoriesRoutes       from './routes/categories.routes';
import coursesRoutes          from './routes/courses.routes';
import batchesRoutes          from './routes/batches.routes';
import modulesRoutes          from './routes/modules.routes';
import videosRoutes           from './routes/videos.routes';
import materialsRoutes        from './routes/materials.routes';
import paymentMethodsRoutes   from './routes/paymentMethods.routes';
import paymentsRoutes         from './routes/payments.routes';
import enrollmentsRoutes      from './routes/enrollments.routes';
import attendanceRoutes       from './routes/attendance.routes';
import dashboardRoutes        from './routes/dashboard.routes';
import profileRoutes          from './routes/profile.routes';
import studentMaterialsRoutes from './routes/student_materials.routes';
import hostelRoutes           from './routes/hostel.routes';
import examFeesRoutes        from './routes/examFees.routes';
import newAdmissionsRoutes   from './routes/newAdmissions.routes';

const app  = express();
const PORT = process.env.PORT || 5007;
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',').map(v => v.trim()).filter(Boolean);
const allowedOrigins = isProduction
  ? configuredOrigins
  : Array.from(new Set([...configuredOrigins, 'http://localhost:5123', 'http://127.0.0.1:5123', 'http://localhost:3000', 'http://127.0.0.1:3000']));
if (isProduction && allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URL must be set in production');
}
app.set('trust proxy', 1);

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',              authRoutes);
app.use('/api/users',             usersRoutes);
app.use('/api/students',          studentsRoutes);
app.use('/api/categories',        categoriesRoutes);
app.use('/api/courses',           coursesRoutes);
app.use('/api/batches',           batchesRoutes);
app.use('/api/modules',           modulesRoutes);
app.use('/api/videos',            videosRoutes);
app.use('/api/materials',         materialsRoutes);
app.use('/api/payment-methods',   paymentMethodsRoutes);
app.use('/api/payments',          paymentsRoutes);
app.use('/api/enrollments',       enrollmentsRoutes);
app.use('/api/attendance',        attendanceRoutes);
app.use('/api/dashboard',         dashboardRoutes);
app.use('/api/profile',           profileRoutes);
app.use('/api/student-materials', studentMaterialsRoutes);
app.use('/api/hostel',            hostelRoutes);
app.use('/api/exam-fees',         examFeesRoutes);
app.use('/api/new-admissions',    newAdmissionsRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'EPFT API is running', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable', database: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Migration runner
// Runs a named migration inside a transaction.
// Records success in schema_migrations. On failure: rolls back, does NOT record.
// ─────────────────────────────────────────────────────────────────────────────
async function runMigration(name: string, sql: string): Promise<void> {
  // Check if already applied
  const check = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
    [name]
  );
  if (check.rows.length > 0) {
    // v11 is intentionally self-repairing because an earlier deployment could
    // have recorded it before all of its schema changes were applied.
    if (name === 'migrate_v11') {
      const schemaCheck = await pool.query(`
        SELECT
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'students'
              AND column_name = 'email'
          ) AS email_exists,
          EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'students'
              AND column_name = 'email'
              AND is_nullable = 'YES'
          ) AS email_nullable,
          EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'new_admissions'
          ) AS new_admissions_exists
      `);
      const state = schemaCheck.rows[0];
      if (!state.email_exists || !state.email_nullable || !state.new_admissions_exists) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('COMMIT');
          console.log(`🔧 Migration ${name} repaired missing schema changes`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Migration ${name} repair FAILED — rolled back.`, err);
        } finally {
          client.release();
        }
      } else {
        console.log(`⏭️  Migration ${name} already applied — schema verified`);
      }
    } else {
      console.log(`⏭️  Migration ${name} already applied — skipping`);
    }
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (migration_name, applied_at) VALUES ($1, NOW())',
      [name]
    );
    await client.query('COMMIT');
    console.log(`✅ Migration ${name} applied`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration ${name} FAILED — rolled back. Will retry on next start.`, err);
    // Do not re-throw: allow other migrations and startup to continue
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB Init
// ─────────────────────────────────────────────────────────────────────────────
const initDb = async () => {
  // ── 1. Wait for PostgreSQL ───────────────────────────────────────────────
  const maxRetries = 10;
  let retries = 0;
  while (retries < maxRetries) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ PostgreSQL connected');
      break;
    } catch {
      retries++;
      console.log(`⏳ Waiting for PostgreSQL... (${retries}/${maxRetries})`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // ── 2. Base schema (always run — fully idempotent: IF NOT EXISTS everywhere) ──
  try {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Base schema applied');
    }
  } catch (err) {
    console.error('❌ Base schema error:', err);
  }

  // ── 3. Ensure schema_migrations tracking table exists ───────────────────
  // This must happen AFTER schema.sql so update_updated_at_column() exists.
  // It must happen BEFORE any runMigration() call.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(200) PRIMARY KEY,
        applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ schema_migrations table ready');
  } catch (err) {
    console.error('❌ Failed to create schema_migrations table:', err);
    // Cannot safely proceed with tracked migrations — abort init
    return;
  }

  // ── 4. Versioned migrations (tracked — run each exactly once) ────────────
  const migrations: Array<{ name: string; file: string }> = [
    { name: 'migrate_v2', file: 'migrate_v2.sql' },
    { name: 'migrate_v3', file: 'migrate_v3.sql' },
    { name: 'migrate_v4', file: 'migrate_v4.sql' },
    { name: 'migrate_v5', file: 'migrate_v5.sql' },
    { name: 'migrate_v6', file: 'migrate_v6.sql' },
    { name: 'migrate_v7', file: 'migrate_v7.sql' },
    { name: 'migrate_v8', file: 'migrate_v8.sql' },
    { name: 'migrate_v9', file: 'migrate_v9.sql' },
    { name: 'migrate_v10', file: 'migrate_v10.sql' },
    { name: 'migrate_v11', file: 'migrate_v11.sql' },
    { name: 'migrate_v12', file: 'migrate_v12.sql' },
    { name: 'migrate_v13', file: 'migrate_v13.sql' },
    { name: 'migrate_v14', file: 'migrate_v14.sql' },
  ];

  for (const m of migrations) {
    try {
      const filePath = path.join(__dirname, '../../database', m.file);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Migration file ${m.file} not found — skipping`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await runMigration(m.name, sql);
    } catch (err) {
      console.error(`❌ Unexpected error preparing migration ${m.name}:`, err);
    }
  }

  // ── 5. Seed/bootstrap users ────────────────────────────────────────────
  // Development can opt into the bundled demo accounts. Production never
  // resets existing passwords or silently creates known-password accounts.
  try {
    const seedDefaults = process.env.SEED_DEFAULT_USERS === 'true' && !isProduction;
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (seedDefaults) {
      const hash = await hashPassword('Admin@123');
      await pool.query(`
        INSERT INTO users (full_name, email, password_hash, role, is_active)
        VALUES
          ('Super Admin',   'admin@nalamacademy.com',    $1, 'super_admin', true),
          ('Admin User',    'admin2@nalamacademy.com',   $1, 'admin',       true),
          ('Incharge User', 'incharge@nalamacademy.com', $1, 'incharge',    true),
          ('Teacher User',  'teacher@nalamacademy.com',  $1, 'teacher',     true)
        ON CONFLICT (email) DO NOTHING
      `, [hash]);
      console.log('✅ Development default users ensured');
    } else if (bootstrapEmail && bootstrapPassword) {
      const existing = await pool.query('SELECT id FROM users WHERE LOWER(email)=$1', [bootstrapEmail]);
      if (existing.rows.length === 0) {
        const hash = await hashPassword(bootstrapPassword);
        await pool.query(`
          INSERT INTO users (full_name, email, password_hash, role, is_active)
          VALUES ('Super Admin', $1, $2, 'super_admin', true)
        `, [bootstrapEmail, hash]);
        console.log(`✅ Bootstrap admin created: ${bootstrapEmail}`);
      } else {
        console.log('⏭️ Bootstrap admin already exists — password was not changed');
      }
    } else {
      console.log('ℹ️ User seeding skipped (production-safe mode)');
    }
  } catch (err) {
    console.error('❌ User bootstrap error:', err);
  }

  // ── 6. Sample seed ─────────────────────────────────────────────────────
  // Never inject demo students/payments into production automatically.
  if (process.env.SEED_SAMPLE_DATA === 'true' && !isProduction) {
    try {
      const seedPath = path.join(__dirname, '../../database/seed_sample.sql');
      if (fs.existsSync(seedPath)) {
        const seed = fs.readFileSync(seedPath, 'utf8');
        await pool.query(seed);
        console.log('✅ Sample data seeded');
      }
    } catch (err) {
      console.error('❌ Sample seed error:', err);
    }
  } else {
    console.log('ℹ️ Sample data seed skipped');
  }
};

initDb().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 EPFT Backend running on port ${PORT}`);
    console.log(`📍 API: http://localhost:${PORT}/api`);
    console.log(`🏫 Nalam Academy - EPFT System`);
    console.log('🔐 Authentication enabled');
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}).catch(err => {
  console.error('Failed to initialize:', err);
  process.exit(1);
});

export default app;
