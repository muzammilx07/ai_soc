from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database import init_db
from backend.routers import (
    alerts_router,
    health_router,
    incidents_router,
    logs_router,
    prediction_router,
    response_router,
    soc_router,
)
from backend.services import get_streamer
from backend.utils import setup_logging


logger = setup_logging(log_level="INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application startup initiated")
    await init_db()
    logger.info("Database initialized")
    streamer = get_streamer()
    await streamer.start_simulator(interval_seconds=2.0)
    logger.info("Event simulator started")
    try:
        yield
    finally:
        await streamer.stop_simulator()
        logger.info("Event simulator stopped")
        logger.info("Application shutdown completed")


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(prediction_router)
app.include_router(logs_router)
app.include_router(incidents_router)
app.include_router(alerts_router)
app.include_router(response_router)
app.include_router(soc_router)
