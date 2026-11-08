from contextvars import ContextVar


class BudgetExceededError(Exception):
    pass


class TokenBudget:
    """Counts LLM tokens for one run segment and stops the run when the limit is passed."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0

    def add(self, tokens: int) -> None:
        self.used += tokens
        if self.used > self.limit:
            raise BudgetExceededError(
                f"This run used more than its token budget ({self.limit:,} tokens)."
            )


current_budget: ContextVar[TokenBudget | None] = ContextVar("current_budget", default=None)
