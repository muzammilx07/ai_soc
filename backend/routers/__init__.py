from backend.routers.alerts import router as alerts_router
from backend.routers.health import router as health_router
from backend.routers.ingest import router as ingest_router
from backend.routers.instances import router as instances_router
from backend.routers.incidents import router as incidents_router
from backend.routers.logs import router as logs_router
from backend.routers.prediction import router as prediction_router
from backend.routers.response import router as response_router
from backend.routers.soc import router as soc_router

__all__ = [
    "health_router",
    "ingest_router",
    "instances_router",
    "logs_router",
    "prediction_router",
    "incidents_router",
    "alerts_router",
    "response_router",
    "soc_router",
]
