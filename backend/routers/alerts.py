from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, Query

from backend.database import get_db
from backend.models.db_models import Alert
from backend.models.schemas import AlertRead

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRead])
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    instance_id: str | None = Query(default=None),
) -> list[Alert]:
    query = select(Alert)
    if instance_id:
        query = query.where(Alert.instance_id == instance_id)
    result = await db.execute(query.order_by(Alert.created_at.desc()))
    return list(result.scalars().all())
