import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.db.models import Depth, RunStatus


class RunCreate(BaseModel):
    question: str = Field(min_length=10, max_length=1000)
    depth: Depth = Depth.QUICK

    @field_validator("question")
    @classmethod
    def _strip_and_recheck(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Question must be at least 10 characters")
        return value


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question: str
    depth: Depth
    status: RunStatus
    error: str | None
    source_count: int = 0
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class RunList(BaseModel):
    items: list[RunOut]
    next_cursor: str | None
