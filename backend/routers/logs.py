import csv
import io
import json
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.config import settings
from backend.models.db_models import Alert
from backend.services import enqueue_events, get_instance_by_credentials, get_streamer

router = APIRouter(prefix="/logs", tags=["logs"])


class SimulateRequest(BaseModel):
    count: int = 1


@router.post("/upload")
async def upload_logs(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    x_instance_id: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
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

    source = "csv_upload"
    if file.filename and file.filename.lower().endswith(".json"):
        source = "json_upload"

    if not x_instance_id or not x_api_key:
        raise HTTPException(status_code=401, detail="Missing instance credentials")

    instance = await get_instance_by_credentials(
        db=db,
        instance_id=str(x_instance_id),
        api_key=str(x_api_key),
    )
    if instance is None:
        raise HTTPException(status_code=403, detail="Invalid instance credentials")

    try:
        await enqueue_events(
            raw_events=records,
            source=source,
            instance_id=str(instance.instance_id),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "filename": file.filename,
        "ingested_records": len(records),
    }


@router.post("/simulate")
async def simulate_logs(
    payload: SimulateRequest,
    db: AsyncSession = Depends(get_db),
    x_instance_id: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    if payload.count < 1 or payload.count > 500:
        raise HTTPException(status_code=400, detail="count must be between 1 and 500")

    streamer = get_streamer()
    simulated = []
    for _ in range(payload.count):
        simulated.append(streamer.generate_simulated_event())

    target_instance_id = settings.default_instance_id
    ingestion_mode = "hybrid"
    if x_instance_id and x_api_key:
        instance = await get_instance_by_credentials(
            db=db,
            instance_id=str(x_instance_id),
            api_key=str(x_api_key),
        )
        if instance is None:
            raise HTTPException(status_code=403, detail="Invalid instance credentials")
        target_instance_id = str(instance.instance_id)
        ingestion_mode = str(instance.ingestion_mode)

    try:
        queued_count = await enqueue_events(
            raw_events=simulated,
            source="simulator",
            instance_id=target_instance_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "generated_count": len(simulated),
        "queued_count": queued_count,
        "instance_id": target_instance_id,
        "ingestion_mode": ingestion_mode,
        "events": simulated,
    }


@router.get("/live")
async def get_live_events(
    limit: int = 50,
    instance_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    streamer = get_streamer()
    events = await streamer.get_recent_events(limit=limit)
    if instance_id:
        events = [e for e in events if str(e.get("instance_id") or "") == str(instance_id)]

    total_query = select(func.count(Alert.id))
    if instance_id:
        total_query = total_query.where(Alert.instance_id == instance_id)
    total_result = await db.execute(total_query)
    total_count = int(total_result.scalar_one() or 0)

    backend = (await streamer.health())["queue_backend"]

    return {
        "queue_backend": backend,
        "count": len(events),
        "total_count": total_count,
        "events": events,
    }
