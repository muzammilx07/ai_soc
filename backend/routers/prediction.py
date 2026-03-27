from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import get_detector, map_to_mitre, respond_with_new_session
from backend.utils import get_logger


logger = get_logger("prediction_router")

router = APIRouter(prefix="/prediction", tags=["prediction"])


class PredictionRequest(BaseModel):
    features: dict[str, Any]
    source_ip: str | None = None
    destination_ip: str | None = None
    trigger_response: bool = False


@router.post("")
async def predict_threat(payload: PredictionRequest) -> dict[str, Any]:
    logger.info(
        "Prediction endpoint called: trigger_response={}, source_ip_present={}",
        payload.trigger_response,
        bool(payload.source_ip),
    )
    detector = get_detector()

    try:
        result = detector.predict_from_features(payload.features)
    except FileNotFoundError as exc:
        logger.exception("Prediction failed due to missing model artifacts")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Prediction failed with runtime error")
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}") from exc

    attack_type = result.get("prediction", {}).get("attack_type", "Unknown")
    result["mitre"] = map_to_mitre(str(attack_type))

    if payload.trigger_response:
        response_result = await respond_with_new_session(
            detection_result=result,
            source_ip=payload.source_ip,
            destination_ip=payload.destination_ip,
        )
        result["response"] = response_result
        logger.info("Automated response triggered successfully")

    return result
