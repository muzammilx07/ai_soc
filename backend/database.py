from collections.abc import AsyncGenerator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from backend.models import db_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_instance_columns)
        await conn.run_sync(_ensure_instance_table_columns)
        await conn.run_sync(_ensure_default_instance)


def _ensure_instance_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    table_names = {
        "alerts",
        "incidents",
        "blocked_ips",
        "response_logs",
    }
    existing_tables = set(inspector.get_table_names())

    for table_name in table_names:
        if table_name not in existing_tables:
            continue

        columns = {column["name"] for column in inspector.get_columns(table_name)}
        if "instance_id" in columns:
            continue

        sync_conn.execute(
            text(
                f"ALTER TABLE {table_name} "
                "ADD COLUMN instance_id VARCHAR(64) NOT NULL DEFAULT 'default'"
            )
        )


def _ensure_default_instance(sync_conn) -> None:
    from backend.config import settings

    result = sync_conn.execute(
        text("SELECT instance_id FROM soc_instances WHERE instance_id = :instance_id LIMIT 1"),
        {"instance_id": settings.default_instance_id},
    )
    if result.scalar_one_or_none() is not None:
        return

    sync_conn.execute(
        text(
            "INSERT INTO soc_instances (instance_id, name, api_key, ingestion_mode, active) "
            "VALUES (:instance_id, :name, :api_key, :ingestion_mode, :active)"
        ),
        {
            "instance_id": settings.default_instance_id,
            "name": "Default Instance",
            "api_key": settings.default_instance_api_key,
            "ingestion_mode": settings.default_ingestion_mode,
            "active": True,
        },
    )


def _ensure_instance_table_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    if "soc_instances" not in set(inspector.get_table_names()):
        return

    columns = {column["name"] for column in inspector.get_columns("soc_instances")}
    if "name" not in columns:
        sync_conn.execute(
            text(
                "ALTER TABLE soc_instances "
                "ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT 'Unnamed Instance'"
            )
        )

    sync_conn.execute(
        text(
            "UPDATE soc_instances "
            "SET name = COALESCE(NULLIF(name, ''), instance_id)"
        )
    )
