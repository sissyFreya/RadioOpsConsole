# RadioOps Console (Plug-and-Play)

A professional, modern ops console to administer multiple radios (Icecast + Liquidsoap) across one or more Linux nodes.

## Included
- **Backend**: FastAPI + PostgreSQL
  - JWT authentication
  - Nodes, Radios, Actions
  - Audit trail
  - WebSocket proxy for real-time logs
- **Agent** (per node): FastAPI
  - Service status (mock by default)
  - Whitelisted actions (`restart`, `reload`)
  - Real-time logs via WebSocket (`journalctl -fu <service>` when not in mock)
- **Frontend**: React + TypeScript + Vite
  - Tailwind + shadcn-style UI components
  - Pro ops UX: Sidebar, Dashboard, Radios, Radio detail (Overview/Logs/Actions)
  - Real-time logs view (pause/clear/autoscroll)

## Quick start (Docker)

1. In the project root:

```bash
cp .env.example .env
docker compose up --build
```

2. Open the UI:
- Frontend: `http://localhost:5173`
- Backend API docs: `http://localhost:8000/docs`

### Default credentials
- Email: `admin@local`
- Password: `admin`

## Dev start (without Docker)

### Backend
```bash
cd backend
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Agent
```bash
cd agent
cp .env.example .env
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 9000
```

### Frontend
```bash
cd frontend
npm i
npm run dev
```

## Production note
This MVP is safe-by-default (no arbitrary shell execution). For production:
- Run behind HTTPS (reverse proxy)
- Set strong secrets (`JWT_SECRET`, admin password)
- Disable `MOCK_MODE` on agents and ensure `journalctl` is available

