-- ============================================================
-- EPFT - Educational Platform & Finance Tracker
-- Nalam Academy - PostgreSQL Schema
-- Database: epft
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE (Super Admin, Admin, Faculty, Student users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'admin', 'incharge', 'teacher', 'student')),
    is_active BOOLEAN DEFAULT true,
    reset_token VARCHAR(255),
    reset_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- COURSE CATEGORIES TABLE (Parent → Course hierarchy)
-- Designed to support future Student LMS without schema changes.
-- ============================================================
CREATE TABLE IF NOT EXISTS course_categories (
    id SERIAL PRIMARY KEY,
    category_name VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_category_name UNIQUE (category_name)
);

CREATE INDEX IF NOT EXISTS idx_categories_status ON course_categories(status);

-- ============================================================
-- COURSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES course_categories(id) ON DELETE SET NULL,
    course_name VARCHAR(200) NOT NULL,
    description TEXT,
    duration VARCHAR(100),
    fee_amount NUMERIC(10,2) DEFAULT 0 CHECK (fee_amount >= 0),
    is_free BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe migration: add category_id to existing courses table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='courses' AND column_name='category_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN category_id INTEGER REFERENCES course_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Safe migration: add fee_amount non-negative check
DO $$ BEGIN
  ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_fee_amount_check;
  ALTER TABLE courses ADD CONSTRAINT courses_fee_amount_check CHECK (fee_amount >= 0);
EXCEPTION WHEN others THEN NULL;
END $$;

-- Unique constraint: course_name must be unique within a category (nullable category = global)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_course_name_category'
  ) THEN
    ALTER TABLE courses ADD CONSTRAINT uq_course_name_category UNIQUE (course_name, category_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category_id);


-- ============================================================
-- BATCHES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS batches (
    id SERIAL PRIMARY KEY,
    batch_name VARCHAR(150) NOT NULL,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_course ON batches(course_id);

-- ============================================================
-- STUDENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    student_id VARCHAR(20) UNIQUE NOT NULL,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('Male', 'Female', 'Other')),
    address TEXT,
    parent_name VARCHAR(150),
    parent_mobile VARCHAR(15),
    photo_url VARCHAR(255),
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    admission_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'discontinued')),
    discontinued_at TIMESTAMPTZ,
    discontinued_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure discontinued columns exist on existing deployments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='discontinued_at') THEN
    ALTER TABLE students ADD COLUMN discontinued_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='discontinued_reason') THEN
    ALTER TABLE students ADD COLUMN discontinued_reason TEXT;
  END IF;
END $$;

-- Certificate collection flags (original marksheets collected from student)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_10th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_10th_collected BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_12th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_12th_collected BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_diploma_collected') THEN
    ALTER TABLE students ADD COLUMN cert_diploma_collected BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Discontinue-time certificate verification snapshot
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='disc_cert_10th') THEN
    ALTER TABLE students ADD COLUMN disc_cert_10th BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='disc_cert_12th') THEN
    ALTER TABLE students ADD COLUMN disc_cert_12th BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='disc_cert_diploma') THEN
    ALTER TABLE students ADD COLUMN disc_cert_diploma BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Update CHECK constraint to include 'discontinued'
DO $$ BEGIN
  ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
  ALTER TABLE students ADD CONSTRAINT students_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'discontinued'));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- ============================================================
-- LMS MODULES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS lms_modules (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_name VARCHAR(200) NOT NULL,
    order_number INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lms_modules_course ON lms_modules(course_id);

-- ============================================================
-- LMS VIDEOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS lms_videos (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES lms_modules(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    thumbnail_url VARCHAR(255),
    video_url VARCHAR(255) NOT NULL,
    is_free BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    order_number INTEGER DEFAULT 1,
    duration_seconds INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_course ON lms_videos(course_id);
CREATE INDEX IF NOT EXISTS idx_videos_module ON lms_videos(module_id);

-- ============================================================
-- LMS MATERIALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS lms_materials (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    module_id INTEGER REFERENCES lms_modules(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url VARCHAR(255) NOT NULL,
    file_type VARCHAR(20) CHECK (file_type IN ('pdf', 'ppt', 'docx', 'zip', 'other')),
    is_free BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_course ON lms_materials(course_id);

-- ============================================================
-- PAYMENT METHODS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    method_type VARCHAR(20) NOT NULL CHECK (method_type IN ('bank', 'upi', 'cash')),
    account_holder_name VARCHAR(150),
    bank_name VARCHAR(150),
    account_number VARCHAR(50),
    ifsc_code VARCHAR(20),
    upi_id VARCHAR(100),
    qr_image_url VARCHAR(255),
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENROLLMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    application_fee NUMERIC(10,2) DEFAULT 0,
    course_fee NUMERIC(10,2) DEFAULT 0,
    materials_fee NUMERIC(10,2) DEFAULT 0,
    total_fee NUMERIC(10,2) GENERATED ALWAYS AS (COALESCE(application_fee,0) + COALESCE(course_fee,0) + COALESCE(materials_fee,0)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON enrollments(status);

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
    payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    payment_date DATE DEFAULT CURRENT_DATE,
    transaction_reference VARCHAR(200),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    notes TEXT,
    verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- ============================================================
-- VIDEO PROGRESS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS video_progress (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    video_id INTEGER NOT NULL REFERENCES lms_videos(id) ON DELETE CASCADE,
    watched_seconds INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    last_watched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_student ON video_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_video ON video_progress(video_id);

-- ============================================================
-- ATTENDANCE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
    marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_batch ON attendance(batch_id);

-- ============================================================
-- FACULTY TABLE (extra profile for faculty users)
-- ============================================================
CREATE TABLE IF NOT EXISTS faculty (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mobile VARCHAR(15),
    specialization VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- MIGRATIONS (safe, idempotent)
-- ============================================================


-- Fee columns on enrollments (safe migration)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS application_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS course_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS materials_fee NUMERIC(10,2) DEFAULT 0;
-- total_fee as generated column — only add if not already there
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='total_fee') THEN
    ALTER TABLE enrollments ADD COLUMN total_fee NUMERIC(10,2) GENERATED ALWAYS AS (COALESCE(application_fee,0) + COALESCE(course_fee,0) + COALESCE(materials_fee,0)) STORED;
  END IF;
END $$;

-- Change 1: Update role constraint to include incharge/teacher
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'incharge', 'teacher', 'student'));

-- Change 4: Certificate URL columns
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_10th_url VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_12th_url VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS cert_diploma_url VARCHAR(255);

-- Change 4: Parent presence flag
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_present BOOLEAN DEFAULT false;

-- Change 8: Profile photo for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(255);

-- Existing cert collection flags (ensure they exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_10th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_10th_collected BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_12th_collected') THEN
    ALTER TABLE students ADD COLUMN cert_12th_collected BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='cert_diploma_collected') THEN
    ALTER TABLE students ADD COLUMN cert_diploma_collected BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users','course_categories','courses','batches','students','lms_modules','lms_videos','lms_materials','payment_methods','enrollments','payments','faculty','attendance'] LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS set_updated_at ON %I;
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- ============================================================
-- CONSENT COLUMNS (idempotent migration)
-- ============================================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS consent_image_url VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS consent_pdf_url VARCHAR(255);
ALTER TABLE students ADD COLUMN IF NOT EXISTS consent_video_url VARCHAR(255);
