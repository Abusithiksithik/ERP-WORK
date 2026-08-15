import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { pool } from './config/db';
import { hashPassword } from './utils/bcrypt';

dotenv.config();

// Routes
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import studentsRoutes from './routes/students.routes';
import categoriesRoutes from './routes/categories.routes';
import coursesRoutes from './routes/courses.routes';
import batchesRoutes from './routes/batches.routes';
import modulesRoutes from './routes/modules.routes';
import videosRoutes from './routes/videos.routes';
import materialsRoutes from './routes/materials.routes';
import paymentMethodsRoutes from './routes/paymentMethods.routes';
import paymentsRoutes from './routes/payments.routes';
import enrollmentsRoutes from './routes/enrollments.routes';
import attendanceRoutes from './routes/attendance.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/batches', batchesRoutes);
app.use('/api/modules', modulesRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/payment-methods', paymentMethodsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/enrollments', enrollmentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'EPFT API is running', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// Initialize DB and start server
const initDb = async () => {
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

  // Run schema
  try {
    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Schema applied');
    }
  } catch (err) {
    console.error('Schema error:', err);
  }

  // Run seed with real bcrypt hash
  try {
    const seedPath = path.join(__dirname, '../../database/seed.sql');
    if (fs.existsSync(seedPath)) {
      const hash = await hashPassword('Admin@123');
      let seed = fs.readFileSync(seedPath, 'utf8');
      // Replace placeholder hash with real one
      seed = seed.replace(
        `'$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'`,
        `'${hash}'`
      );
      await pool.query(seed);
      console.log('✅ Seed data applied');
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
};

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 EPFT Backend running on port ${PORT}`);
    console.log(`📍 API: http://localhost:${PORT}/api`);
    console.log(`🏫 Nalam Academy - EPFT System`);
  });
}).catch(err => {
  console.error('Failed to initialize:', err);
  process.exit(1);
});

export default app;
