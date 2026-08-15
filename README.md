# EPFT - Educational Platform & Finance Tracker
## Nalam Academy

A complete production-ready ERP + LMS web application.

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose installed

### Start the Application

```bash
# Clone the project and navigate to it
cd epft

# Start all services
docker-compose up --build
```

### Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000/api |
| PostgreSQL | localhost:5432 |

### Default Super Admin Login

| Field | Value |
|-------|-------|
| Email | admin@nalamacademy.com |
| Password | Admin@123 |

---

## 🛠️ Development Setup (Without Docker)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm

### 1. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE epft;"

# Run schema
psql -U postgres -d epft -f database/schema.sql

# Run seed (creates super admin)
psql -U postgres -d epft -f database/seed.sql
```

### 2. Backend Setup

```bash
cd backend
npm install

# Update .env with your local DB settings
# Change DB_HOST to localhost

npm run dev
```

Backend runs at: http://localhost:5000

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

---

## 📁 Project Structure

```
epft/
├── docker-compose.yml
├── .env.example
├── README.md
├── database/
│   ├── schema.sql        # Complete PostgreSQL schema
│   └── seed.sql          # Super admin seed
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts      # Entry point
│       ├── config/       # Database config
│       ├── middleware/   # Auth, RBAC, file uploads
│       ├── routes/       # All API routes
│       └── utils/        # JWT, bcrypt helpers
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── api/          # Axios config
│       ├── components/   # Reusable components
│       ├── context/      # Auth context
│       ├── pages/        # All pages
│       ├── types/        # TypeScript types
│       └── utils/
```

---

## 🔐 User Roles

| Role | Access |
|------|--------|
| Super Admin | Full system access |
| Admin | Manage students, courses, payments, LMS |
| Faculty | Attendance, course materials |
| Student | Watch videos, view materials, enroll |

---

## 📡 API Endpoints

| Module | Base Route | Methods |
|--------|-----------|---------|
| Auth | /api/auth | POST login, change-password, forgot-password, reset-password |
| Users | /api/users | GET, POST, PUT, DELETE |
| Students | /api/students | GET, POST, PUT, DELETE + /export |
| Courses | /api/courses | GET, POST, PUT, DELETE + status toggle |
| Batches | /api/batches | GET, POST, PUT, DELETE |
| LMS Modules | /api/modules | GET, POST, PUT, DELETE |
| LMS Videos | /api/videos | GET, POST, PUT, DELETE + publish + progress |
| Materials | /api/materials | GET, POST, PUT, DELETE |
| Payment Methods | /api/payment-methods | GET, POST, PUT, DELETE + toggle |
| Payments | /api/payments | GET, POST + verify |
| Enrollments | /api/enrollments | GET, POST + approve/reject + progress |
| Attendance | /api/attendance | POST mark, GET records + reports |
| Dashboard | /api/dashboard | GET stats, charts |

---

## 📋 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 16
- **Auth**: JWT
- **File Upload**: Multer
- **Charts**: Recharts
- **Containerization**: Docker + Docker Compose

---

## 🔧 Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `DB_PASSWORD`: PostgreSQL password (default: 12345)
- `JWT_SECRET`: JWT signing secret
- `PORT`: Backend port (default: 5000)

---

© 2024 Nalam Academy. All rights reserved.
