from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo-root .env (also works from any working directory); ignored if missing, e.g. in Docker.
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    database_url: str = "postgresql+psycopg://scholar:scholar@localhost:5434/scholar"

    groq_api_key: str = ""
    groq_api_keys: str = ""  # optional comma-separated list; rotated round-robin
    tavily_api_key: str = ""
    groq_strong_model: str = "llama-3.3-70b-versatile"
    groq_fast_model: str = "llama-3.1-8b-instant"
    openrouter_api_key: str = ""  # optional last-resort fallback (free models)
    openrouter_strong_model: str = "google/gemma-4-31b-it:free"
    openrouter_fast_model: str = "google/gemma-4-26b-a4b-it:free"
    llm_provider: str = "fake"
    search_provider: str = "fake"
    fake_step_delay_ms: int = 0

    run_token_budget: int = 150_000
    run_timeout_seconds: int = 600
    max_research_concurrency: int = 3

    clerk_jwks_url: str = ""
    clerk_issuer: str = ""
    clerk_authorized_parties: str = ""

    frontend_origin: str = "http://localhost:3000"
    daily_run_limit: int = 5
    ip_rate_limit_per_minute: int = 240  # 0 turns the per-IP limit off

    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_base_url: str = "https://cloud.langfuse.com"
    langfuse_tracing_environment: str = "development"  # production, staging or development
    langfuse_release: str = ""

    @property
    def groq_keys(self) -> list[str]:
        listed = [k.strip() for k in self.groq_api_keys.split(",") if k.strip()]
        keys = [self.groq_api_key, *listed] if self.groq_api_key else listed
        return list(dict.fromkeys(keys))  # drop duplicates, keep order


settings = Settings()
