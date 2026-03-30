from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends, HTTPException, status

from backend.database import get_db
from backend.models.schemas import InstanceCreate, InstanceDeleteResponse, InstanceRead
from backend.services.instances import create_instance, delete_instance, list_active_instances

router = APIRouter(prefix="/instances", tags=["instances"])


@router.get("", response_model=list[InstanceRead])
async def get_instances(db: AsyncSession = Depends(get_db)) -> list[InstanceRead]:
    instances = await list_active_instances(db=db)
    return [InstanceRead.model_validate(item) for item in instances]


@router.post("", response_model=InstanceRead, status_code=status.HTTP_201_CREATED)
async def post_instance(
    payload: InstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> InstanceRead:
    instance = await create_instance(db=db, name=payload.name, ingestion_mode=payload.ingestion_mode)
    return InstanceRead.model_validate(instance)


@router.delete("/{instance_id}", response_model=InstanceDeleteResponse)
async def remove_instance(instance_id: str, db: AsyncSession = Depends(get_db)) -> InstanceDeleteResponse:
    deleted = await delete_instance(db=db, instance_id=instance_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Instance not found")
    return InstanceDeleteResponse(instance_id=instance_id, deleted=True)