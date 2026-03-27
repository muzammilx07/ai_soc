from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.database import get_db
from backend.models.db_models import ResponseLog
from backend.models.schemas import ResponseLogRead
from backend.services import get_responder

router = APIRouter(prefix="/response", tags=["response"])


class ResponseTriggerRequest(BaseModel):
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
        source_ip=payload.source_ip,
        destination_ip=payload.destination_ip,
    )
    return result


@router.get("/logs", response_model=list[ResponseLogRead])
async def list_response_logs(db: AsyncSession = Depends(get_db)) -> list[ResponseLog]:
    result = await db.execute(select(ResponseLog).order_by(ResponseLog.created_at.desc()))
    return list(result.scalars().all())
