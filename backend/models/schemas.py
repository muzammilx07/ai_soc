from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AlertBase(BaseModel):
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
