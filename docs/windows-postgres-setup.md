# Installing PostgreSQL on Windows (no Docker)

This guide installs PostgreSQL 18 on Windows and connects ReturnGuard to it. It takes about 10 minutes. You don't need Docker or virtualization.

You'll type commands into **Windows Terminal** or **PowerShell**. To open one, press the **Windows key**, type `powershell`, and press **Enter**.

---

## Step 1: Download and install PostgreSQL

Paste this into PowerShell and press **Enter**:

```powershell
winget install -e --id PostgreSQL.PostgreSQL.18 --interactive
```

- If it asks you to accept source agreements, type `Y` and press Enter.
- It downloads the official installer (about 350 MB). Wait for the progress bar to finish.
- Windows will ask **"Do you want to allow this app to make changes?"** Click **Yes**.

> **If `winget` isn't recognized:** use the website instead. Go to https://www.enterprisedb.com/downloads/postgres-postgresql-downloads and, in the **18.6** row, click the arrow under **Windows x86-64**. Open the downloaded `.exe` from your browser's downloads list, then continue with Step 2.

## Step 2: Click through the installer

The PostgreSQL setup wizard opens. On each screen:

| Screen | What to do |
|---|---|
| Setup – PostgreSQL | Click **Next** |
| Installation Directory | Keep `C:\Program Files\PostgreSQL\18`. Click **Next**. |
| Select Components | Leave everything ticked. Click **Next**. |
| Data Directory | Keep the default. Click **Next**. |
| **Password** | Choose a password for the `postgres` admin account. Type it twice. **Write it down.** You'll need it in Step 3. Click **Next**. |
| Port | Keep **5432**. Click **Next**. |
| Advanced Options (Locale) | Keep `[Default locale]`. Click **Next**. |
| Pre Installation Summary | Click **Next** |
| Ready to Install | Click **Next**, then wait 1–3 minutes |
| Completing the Setup | **Untick** "Launch Stack Builder at exit", then click **Finish** |

PostgreSQL now runs in the background as a Windows service and starts automatically with Windows.

## Step 3: Create the ReturnGuard database

Close PowerShell and open a new one, so it picks up the new install. Then run these two commands:

```powershell
cd "C:\Users\shoai\New folder\returnguard"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f server/db/create-db.sql
```

When it shows `Password for user postgres:`, type the password from Step 2 and press **Enter**. Nothing appears on screen while you type. That's normal.

You should see:

```
CREATE ROLE
CREATE DATABASE
```

ReturnGuard is already configured for this. `server/.env` points at `postgres://returnguard:returnguard@localhost:5432/returnguard`.

## Step 4: Load the demo data and start the app

```powershell
npm run db:setup
npm run dev
```

Open http://localhost:5173.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `password authentication failed for user "postgres"` | You typed the wrong `postgres` password in Step 3. Run the command again. |
| `role "returnguard" already exists` | Step 3 already ran once. Skip it and go to Step 4. |
| `ECONNREFUSED ... 5432` when running `db:setup` | PostgreSQL isn't running. Press **Windows + R**, type `services.msc`, find **postgresql-x64-18**, right-click it and choose **Start**. |
| `The term '...psql.exe' is not recognized` / path not found | The install didn't finish, or it went to a different folder. Check that `C:\Program Files\PostgreSQL\18\bin\psql.exe` exists. |
| Installer says port 5432 is in use | Another PostgreSQL is already installed. Either use it, or pick port 5433 in the installer and change `5432` to `5433` in `server/.env`. |
