from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI_SOC"
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    database_url: str = "sqlite+aiosqlite:///./data/ai_soc.db"

    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""
    ingest_queue_key: str = "soc:ingest:queue"

    default_instance_id: str = "default"
    default_instance_api_key: str = "dev-default-key"
    default_ingestion_mode: str = "realtime"

    model_dir: str = "backend/ml/saved_models"
    scaler_path: str = "backend/ml/saved_models/scaler.joblib"
    imputer_path: str = "backend/ml/saved_models/imputer.joblib"
    label_encoder_path: str = "backend/ml/saved_models/label_encoder.joblib"
    features_path: str = "backend/ml/saved_models/selected_features.json"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
