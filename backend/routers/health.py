from fastapi import APIRouter

from backend.services import get_streamer

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/services")
async def service_health() -> dict[str, str]:
    streamer = get_streamer()
    queue_health = await streamer.health()
    return {
        "status": "ok",
        "queue_backend": queue_health["queue_backend"],
    }
