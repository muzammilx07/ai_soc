# SOC Project Testing Checklist (Development)

## Prerequisites

- Backend is running on `http://127.0.0.1:8000`
- Frontend is running on `http://localhost:8501`
- Optional: Redis is running (otherwise memory queue fallback should still pass)

## 1. Health Endpoint

- [ ] Call `GET /health`
- [ ] Expect status code `200`
- [ ] Expect JSON response containing `{"status": "ok"}`

- [ ] Call `GET /health/services`
- [ ] Expect status code `200`
- [ ] Confirm `queue_backend` is either `redis` or `memory`

## 2. Prediction Endpoint

- [ ] Call `POST /prediction` with a valid `features` object
- [ ] Expect status code `200`
- [ ] Confirm response includes:
  - [ ] `prediction.attack_type`
  - [ ] `prediction.confidence`
  - [ ] `prediction.severity`
  - [ ] `mitre` mapping object

- [ ] Call `POST /prediction` with `trigger_response=true`
- [ ] Confirm response includes `response.alert_id`
- [ ] If severity is high/critical, verify incident creation in `/incidents`

## 3. Log Upload

- [ ] Upload a sample CSV to `POST /logs/upload`
- [ ] Expect status code `200`
- [ ] Confirm `ingested_records` > 0

- [ ] Upload a sample JSON log file to `POST /logs/upload`
- [ ] Expect status code `200`
- [ ] Confirm records are ingested

## 4. Live Stream

- [ ] Call `POST /logs/simulate` with `{"count": 5}`
- [ ] Expect status code `200`
- [ ] Confirm `generated_count` equals request count

- [ ] Call `GET /logs/live?limit=20`
- [ ] Expect status code `200`
- [ ] Confirm `events` list is returned
- [ ] Confirm at least one recent simulated/uploaded event is present

## 5. Incident Creation

- [ ] Trigger response flow via `POST /prediction` with `trigger_response=true`
- [ ] Ensure payload likely yields high/critical severity
- [ ] Call `GET /incidents`
- [ ] Confirm new incident appears with expected severity/status

## 6. Dashboard Loading

- [ ] Open Streamlit app
- [ ] Verify all pages load without errors:
  - [ ] Live Dashboard
  - [ ] Active Alerts
  - [ ] Incidents
  - [ ] Log Upload
  - [ ] System Status
- [ ] Confirm data is visible on each page after generating/uploading events

## 7. Response Logs (Recommended)

- [ ] Call `GET /response/logs`
- [ ] Confirm actions like `create_alert`, `create_incident`, `send_alert`, or `block_ip` appear after tests

## Pass Criteria

- [ ] Core endpoints respond successfully
- [ ] Event stream works with Redis or memory fallback
- [ ] Predictions and response workflow create expected DB records
- [ ] Dashboard pages render and display backend data
