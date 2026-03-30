from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.database import get_db
from backend.models.db_models import ResponseLog
from backend.models.schemas import ResponseLogRead
from backend.services import get_responder

router = APIRouter(prefix="/response", tags=["response"])


class ResponseTriggerRequest(BaseModel):
    instance_id: str = "default"
    detection_result: dict[str, Any]
    source_ip: str | None = None
    destination_ip: str | None = None


@router.post("/trigger")
async def trigger_response(
    payload: ResponseTriggerRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    responder = get_responder()
    result = await responder.respond(
        db=db,
        detection_result=payload.detection_result,
        instance_id=payload.instance_id,
        source_ip=payload.source_ip,
        destination_ip=payload.destination_ip,
    )
    return result


@router.get("/logs", response_model=list[ResponseLogRead])
async def list_response_logs(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> list[ResponseLog]:
    query = select(ResponseLog)
    if instance_id:
        query = query.where(ResponseLog.instance_id == instance_id)
    result = await db.execute(query.order_by(ResponseLog.created_at.desc()))
    return list(result.scalars().all())
