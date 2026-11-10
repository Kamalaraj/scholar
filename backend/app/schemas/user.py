import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clerk_user_id: str
    email: str | None


class UsageOut(BaseModel):
    """Today's run allowance: `used` of `limit`, renewing at `resets_at` (00:00 UTC)."""

    used: int
    limit: int
    resets_at: datetime
