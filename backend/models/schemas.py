from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AlertBase(BaseModel):
    instance_id: str = "default"
    source_ip: str | None = None
    destination_ip: str | None = None
    attack_type: str
    severity: str
    confidence: float | None = Field(default=None, ge=0, le=1)
    description: str | None = None
    status: str = "open"


class AlertCreate(AlertBase):
    pass


class AlertRead(AlertBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class IncidentBase(BaseModel):
    instance_id: str = "default"
    alert_id: int | None = None
    title: str
    description: str | None = None
    severity: str
    status: str = "open"


class IncidentCreate(IncidentBase):
    pass


class IncidentRead(IncidentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BlockedIPBase(BaseModel):
    instance_id: str = "default"
    ip_address: str
    reason: str | None = None
    active: bool = True
    expires_at: datetime | None = None


class BlockedIPCreate(BlockedIPBase):
    pass


class BlockedIPRead(BlockedIPBase):
    id: int
    blocked_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResponseLogBase(BaseModel):
    instance_id: str = "default"
    alert_id: int | None = None
    incident_id: int | None = None
    action: str
    status: str
    details: str | None = None


class ResponseLogCreate(ResponseLogBase):
    pass


class ResponseLogRead(ResponseLogBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InstanceRead(BaseModel):
    instance_id: str
    name: str
    api_key: str
    ingestion_mode: str
    active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InstanceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    ingestion_mode: str = Field(default="hybrid", min_length=3, max_length=32)


class InstanceDeleteResponse(BaseModel):
    instance_id: str
    deleted: bool
