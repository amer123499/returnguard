-- One-time setup for a local (non-Docker) PostgreSQL install.
-- Run as the postgres superuser:
--   psql -U postgres -f server/db/create-db.sql
-- The app user/password must match DATABASE_URL in server/.env.

CREATE USER returnguard WITH PASSWORD 'returnguard';
CREATE DATABASE returnguard OWNER returnguard;
