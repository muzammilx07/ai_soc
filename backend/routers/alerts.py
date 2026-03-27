from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends

from backend.database import get_db
from backend.models.db_models import Alert
from backend.models.schemas import AlertRead

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRead])
async def list_alerts(db: AsyncSession = Depends(get_db)) -> list[Alert]:
    result = await db.execute(select(Alert).order_by(Alert.created_at.desc()))
    return list(result.scalars().all())
