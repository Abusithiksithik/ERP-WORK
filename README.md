# EPFT Nalam Academy ERP

## Local development

1. Create `backend/.env` with PostgreSQL settings.
2. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
3. Start backend: `npm run dev` (default port 5007).
4. Start frontend: `npm run dev` (default port 5123).

The backend runs `schema.sql` plus tracked migrations `v2` through `v13` automatically at startup. Do **not** manually run migration files against an already-managed database unless you are intentionally repairing a database.

## Production

- Set `NODE_ENV=production`.
- Set a strong 32+ character `JWT_SECRET`.
- Set `DB_PASSWORD` and database connection variables.
- Set `FRONTEND_URL` to the exact frontend origin(s).
- Leave `SEED_DEFAULT_USERS=false` and `SEED_SAMPLE_DATA=false`.
- For first deployment, optionally set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; the bootstrap creates the account only if that email does not already exist and never resets an existing password.
- Put HTTPS in front of the application (reverse proxy/load balancer) before exposing it publicly.

## Validation

Backend build: `cd backend && npm run build`
Frontend build: `cd frontend && npm run build`

The source tree should be deployed from the same release that passed both builds.
