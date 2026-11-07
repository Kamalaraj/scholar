from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://scholar:scholar@localhost:5434/scholar"

    groq_api_key: str = ""
    tavily_api_key: str = ""
    llm_provider: str = "fake"
    search_provider: str = "fake"

    clerk_jwks_url: str = ""
    clerk_issuer: str = ""
    clerk_authorized_parties: str = ""

    frontend_origin: str = "http://localhost:3000"
    daily_run_limit: int = 5

    langsmith_api_key: str = ""
    langsmith_tracing: bool = False


settings = Settings()
