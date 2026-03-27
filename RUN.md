# Run Instructions (Development)

## 1) Install dependencies

```powershell
cd c:\Users\Muzammil\Desktop\ai_soc
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2) Start Redis

Use any local Redis instance. If Redis is not running, the app will fall back to in-memory event queue.

Example (if `redis-server` is available in PATH):

```powershell
redis-server
```

## 3) Run FastAPI backend

Open a new terminal:

```powershell
cd c:\Users\Muzammil\Desktop\ai_soc
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Backend URL: http://127.0.0.1:8000
API docs: http://127.0.0.1:8000/docs

## 4) Run Streamlit frontend

Open another new terminal:

```powershell
cd c:\Users\Muzammil\Desktop\ai_soc
.\.venv\Scripts\Activate.ps1
streamlit run frontend/app.py
```

Frontend URL: http://localhost:8501

## 5) Quick sanity check

1. Open backend docs at `/docs` and call `GET /health`.
2. Open Streamlit and check the `System Status` page.
3. Generate test events from `Log Upload` page.
