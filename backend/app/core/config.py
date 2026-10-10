from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]  # repository root


class Settings(BaseSettings):
    """
    Application settings for the Elenchos backend.
    """
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    log_level: str = "INFO"

    # --- reasoning capability ---------------------------------------------
    default_provider: str = "ollama"
    sample_max_tokens: int = 8000

    # Ollama (local)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_num_ctx: int = 16384  # Ollama's own default context is far too small for these prompts

    # Anthropic (optional)
    anthropic_api_key: str = ""
    model_quick: str = "claude-haiku-5-5"
    model_default: str = "claude-sonnet-5-5"
    model_complex: str = "claude-opus-5-5"

    # --- storage capability -------------------------------------------------
    store_adapter: str = "postgres"  # postgres | memory
    postgres_user: str = "argmap"
    postgres_password: str = "argmap"
    postgres_db: str = "argmap"
    postgres_host: str = "localhost"
    postgres_port: int = 5433

    frontend_dist: Path = ROOT / "frontend" / "dist"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def anthropic_models(self) -> list[str]:
        """
        A function that returns a list of available Anthropic models.

        :return: A list of all available Anthropic models, including quick, default, and complex models.
        """
        return [self.model_quick, self.model_default, self.model_complex]


def get_settings() -> Settings:
    return Settings()
