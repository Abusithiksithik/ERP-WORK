# EPFT Nalam Academy ERP — Setup Guide

## 🔧 Critical Fix Applied
**vite.config.ts proxy was pointing to wrong port (5000 instead of 5007)**
This was causing `ETIMEDOUT` errors on login. Now fixed to `localhost:5007`.

---

## 🚀 First Time Setup

### Step 1 — Run Migration
```bash
psql -U postgres -d epft -f database/migrate.sql
```
This will:
- Update role constraint (faculty → incharge/teacher)
- Add all new columns (parent_present, cert URLs, fee columns)
- Create default access accounts

### Step 2 — Start Backend
```bash
cd backend
npm install
npm run dev
# Running on port 5007
```

### Step 3 — Start Frontend
```bash
cd frontend
npm install
npm run dev
# Running on port 5123
```

---

## 🔑 Login Credentials

| Role         | Email                          | Password   |
|-------------|-------------------------------|------------|
| Super Admin | admin@nalamacademy.com         | Admin@123  |
| Admin       | admin2@nalamacademy.com        | Admin@123  |
| Incharge    | incharge@nalamacademy.com      | Admin@123  |
| Teacher     | teacher@nalamacademy.com       | Admin@123  |

---

## 👥 Role Access Summary

### Admin / Super Admin
- Full access to everything
- Add / Edit / Delete students, users, courses, batches
- Manage enrollments, set fees, record payments
- View all reports

### Incharge
- View & manage students
- View enrollment, attendance, payments
- Record payments
- Cannot manage users or delete records

### Teacher
- View students and attendance
- View videos and materials
- Mark attendance
- Cannot see payments or manage enrollments

---

## 💰 Fee System
1. Enroll a student in a course (Enrollment page)
2. Click 👁 icon to set fee breakdown:
   - Application Fee
   - Course Fee
   - Materials Fee
   - **Total auto-calculated**
3. Click 💰 icon to record a payment
4. Balance = Total Fee − All Payments

---

## 📋 Student Form Flow
1. Photo upload
2. Basic Information
3. Course Selection (Category → Course → Batch)
4. Parent/Guardian (checkbox: present during admission)
5. Certificate Verification (with optional file upload)

---

## 🐛 Known: If login still shows ETIMEDOUT
Make sure backend is running on port 5007:
```bash
# Check .env in backend/
PORT=5007
```
