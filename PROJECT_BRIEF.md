# AI SOC Project Brief

## One-Description Summary
AI SOC is a full-stack Security Operations Center platform that ingests network/security events, classifies threats with ML + rules, maps detections to MITRE ATT&CK context, optionally triggers response actions, stores alerts/incidents in a database, and exposes analyst workflows through a Next.js dashboard.

## Core Goal
Provide an end-to-end SOC workflow in one system:
- ingest logs/events
- detect and classify threats
- generate alerts/incidents
- run response playbooks
- present operational dashboards and case views

## Architecture (High Level)
- Backend: FastAPI app in `backend/` with modular routers and service layer.
- Frontend: Next.js app in `next-frontend/` for dashboard, cases, alerts, playbooks.
- ML assets: serialized preprocessing + model artifacts in `backend/ml/saved_models/`.
- Data: CICIDS raw and processed datasets in `data/`.

Request lifecycle:
1. Event arrives through log upload or simulator.
2. Backend preprocessing + detector produce prediction and severity.
3. MITRE mapping enriches detection output.
4. Optional response engine creates alert/incident and logs actions.
5. Frontend queries API and displays SOC state.
6. Live events are streamed through websocket endpoint.

## Backend Structure
- `backend/main.py`: app startup, CORS, router registration, simulator lifecycle.
- `backend/config.py`: environment settings and runtime config.
- `backend/database.py`: async DB session and initialization.
- `backend/models/`: SQLAlchemy models + Pydantic schemas.
- `backend/services/`: business logic (detector, preprocessor, responder, streamer, playbooks, metrics).
- `backend/routers/`: API surface grouped by domain.

## API Surface (Important)
- Health
  - `GET /health`
  - `GET /health/services`
- Logs and stream
  - `POST /logs/upload` (CSV/JSON ingestion)
  - `POST /logs/simulate` (generate synthetic events)
  - `GET /logs/live` (recent event list)
- Detection/response
  - `POST /prediction` (threat classification, optional `trigger_response`)
  - `POST /response/trigger`
  - `GET /response/logs`
- Case management
  - `GET /alerts`
  - `GET /incidents`
- SOC dashboard/workbench
  - `GET /soc/dashboard`
  - `GET /soc/cases`
  - `GET /soc/cases/{case_id}`
  - `GET /soc/ml/metrics`
  - `GET /soc/threat-report/{case_id}`
  - `GET/POST/PATCH/DELETE /soc/playbooks...`
  - `WS /soc/ws/live` (live stream websocket)

## Frontend Structure
- `next-frontend/app/`: route tree and layouts.
- `next-frontend/components/`: dashboard widgets, tables, playbook board, shared UI.
- `next-frontend/lib/`: API/auth utilities and helpers.
- `next-frontend/types/`: shared TS types.

## ML and Detection Notes
- Training pipeline artifacts are saved in `backend/ml/saved_models/`.
- Prediction router expects a feature dictionary payload.
- Detector output is enriched with MITRE mapping before response handling.
- Response logic can create alert/incident and persist audit logs.

## Data and Persistence
- `data/raw/`: source datasets.
- `data/processed/`: cleaned/EDA outputs.
- DB tables include alerts, incidents, and response logs.
- Event queue supports Redis when available with in-memory fallback.

## Run (Minimal)
Backend (from repo root):
- `C:\Users\Muzammil\Desktop\ai_soc\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`

Frontend:
- `cd next-frontend`
- `npm run dev`

## Common Runtime Pitfalls
1. `uvicorn is not recognized`
- Cause: script not in PATH.
- Fix: use `python -m uvicorn ...` with the venv interpreter.

2. `ModuleNotFoundError: No module named 'backend'`
- Cause: running `main:app` from inside `backend/`.
- Fix: run from repo root with `backend.main:app`.

3. Frontend live stream error (`Live stream connection error`)
- Usually backend is down or websocket endpoint unreachable.
- Ensure backend is running and frontend points to correct API base URL.
- Verify websocket path: `/soc/ws/live`.

## Testing Focus
Use `TESTING_CHECKLIST.md` for smoke tests:
- health and services
- prediction + response path
- log upload/simulate/live retrieval
- incidents/alerts visibility
- dashboard data rendering

## Current Scope and Future Extensions
Current system covers SOC core workflows. Optional enhancements include chatbot/RAG, RBAC, notification channels, advanced analytics, and MLOps model management (see `OPTIONAL_ADVANCED_FEATURES.md`).
