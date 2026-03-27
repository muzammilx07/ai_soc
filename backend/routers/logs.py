import csv
import io
import json
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.services import get_streamer

router = APIRouter(prefix="/logs", tags=["logs"])


class SimulateRequest(BaseModel):
    count: int = 1


@router.post("/upload")
async def upload_logs(file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    text = content.decode("utf-8", errors="ignore").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Uploaded file has no readable content")

    records: list[dict[str, Any]] = []

    if file.filename and file.filename.lower().endswith(".json"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                records = [r for r in parsed if isinstance(r, dict)]
            elif isinstance(parsed, dict):
                records = [parsed]
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}") from exc
    else:
        reader = csv.DictReader(io.StringIO(text))
        records = [dict(r) for r in reader]

    streamer = get_streamer()
    for record in records:
        await streamer.publish_event(record)

    return {
        "filename": file.filename,
        "ingested_records": len(records),
    }


@router.post("/simulate")
async def simulate_logs(payload: SimulateRequest) -> dict[str, Any]:
    if payload.count < 1 or payload.count > 500:
        raise HTTPException(status_code=400, detail="count must be between 1 and 500")

    streamer = get_streamer()
    generated = []
    for _ in range(payload.count):
        generated.append(await streamer.generate_event())

    return {
        "generated_count": len(generated),
        "events": generated,
    }


@router.get("/live")
async def get_live_events(limit: int = 50) -> dict[str, Any]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    streamer = get_streamer()
    events = await streamer.get_recent_events(limit=limit)
    total_count = await streamer.get_total_events()
    backend = (await streamer.health())["queue_backend"]

    return {
        "queue_backend": backend,
        "count": len(events),
        "total_count": total_count,
        "events": events,
    }
