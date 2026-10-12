# Market billing application

React frontend in `fornt/` and an Express/Mongoose backend in `back/`. Features include customer/product management, orders, sales, receipts, ledgers, bill previews/PDF sharing, file backup/restore, and optional local MongoDB to Atlas synchronization.

This version uses MongoDB. The proposed SQLite desktop edition has not been implemented yet.

## Local setup

Install Node.js/npm and a compatible MongoDB Community Server, then start MongoDB.

Copy `back/config/config.env.example` to `back/config/config.env`. Update `DB_LOCAL_URL` with the database you intend to use. The example uses backend port `8000`, which matches the frontend development proxy.

In one terminal:

```powershell
cd back
npm ci
npm start
```

In a second terminal:

```powershell
cd fornt
npm ci
npm start
```

Open `http://localhost:3000/dashboard`.

## Atlas sync

Open **Master → Atlas Sync** to configure a customer-owned Atlas database. Local billing continues without internet as long as the local backend and MongoDB are running. Automatic sync checks run while the backend is running.

See [Atlas Sync setup and limitations](back/atlas-sync/README.md) for access controls, conflict handling, metadata storage and verification. A separate hosted billing deployment and authentication setup are required for cloud access; setting up Atlas sync alone does not host this app.

## Backup

GitHub stores the application source, not MongoDB business data. Use **Dashboard → Download backup** for a business-data backup, and store backups separately from the repository. Local environment files and encrypted Atlas connection settings are excluded from Git.

## Checks

Backend unit tests:

```powershell
cd back
node --test atlas-sync/*.test.js controllers/*.test.js
```

The Atlas integration test is opt-in; see its setup guide before running it.

Frontend tests and production build:

```powershell
cd fornt
npm test -- --watchAll=false --runInBand
npm run build
```
