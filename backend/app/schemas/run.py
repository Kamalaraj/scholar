import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class PlanItemIn(BaseModel):
    text: str = Field(min_length=5, max_length=300)
    reason: str | None = Field(default=None, max_length=300)

    @field_validator("text")
    @classmethod
    def _strip_and_recheck(cls, value: str) -> str:
        value = value.strip()
        if not 5 <= len(value) <= 300:
            raise ValueError("Each item must be 5 to 300 characters")
        return value


class PlanAction(BaseModel):
    """Body of POST /runs/{id}/plan: approve (maybe with edited items) or ask for a new plan."""

    action: Literal["approve", "replan"]
    items: list[PlanItemIn] | None = Field(default=None, min_length=1, max_length=8)
    feedback: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check_action(self) -> "PlanAction":
        if self.action == "replan":
            self.feedback = (self.feedback or "").strip()
            if len(self.feedback) < 3:
                raise ValueError("Tell the planner what to change (at least 3 characters)")
            self.items = None
        else:
            self.feedback = None
        return self


class PlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    position: int
    text: str
    reason: str | None


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    citation_num: int
    url: str
    title: str
    domain: str
    quote: str | None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    markdown: str
    key_findings: list[str]


class RunDetail(RunOut):
    plan: list[PlanItemOut] = []
    sources: list[SourceOut] = []
    report: ReportOut | None = None
