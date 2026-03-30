from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.services import enqueue_events, get_instance_by_credentials

router = APIRouter(tags=["ingest"])


def _coerce_payload(payload: Any) -> tuple[list[dict[str, Any]], str]:
    source = "api"

    if isinstance(payload, list):
        events = [item for item in payload if isinstance(item, dict)]
        return events, source

    if isinstance(payload, dict):
        if isinstance(payload.get("events"), list):
            source = str(payload.get("source") or "api")
            events = [item for item in payload["events"] if isinstance(item, dict)]
            return events, source
        return [payload], str(payload.get("source") or source)

    return [], source


@router.post("/ingest")
async def ingest(
    payload: Any = Body(...),
    db: AsyncSession = Depends(get_db),
    x_instance_id: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> dict[str, Any]:
    events, source = _coerce_payload(payload)
    if not events:
        raise HTTPException(status_code=400, detail="No valid events found in request payload")

    instance_id = x_instance_id or (payload.get("instance_id") if isinstance(payload, dict) else None)
    api_key = x_api_key or (payload.get("api_key") if isinstance(payload, dict) else None)
    if not instance_id or not api_key:
        raise HTTPException(status_code=401, detail="Missing instance credentials")

    instance = await get_instance_by_credentials(db=db, instance_id=str(instance_id), api_key=str(api_key))
    if instance is None:
        raise HTTPException(status_code=403, detail="Invalid instance credentials")
    if str(instance.ingestion_mode).lower() == "disabled":
        raise HTTPException(status_code=403, detail="Ingestion is disabled for this instance")

    try:
        queued_count = await enqueue_events(
            raw_events=events,
            source=source,
            instance_id=str(instance.instance_id),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "status": "accepted",
        "instance_id": str(instance.instance_id),
        "source": source,
        "ingestion_mode": str(instance.ingestion_mode),
        "queued_count": queued_count,
    }