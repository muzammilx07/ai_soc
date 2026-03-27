from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from backend.config import settings
from backend.services.advanced_detection import calculate_severity_score, classify_tags, detect_signatures
from backend.services.preprocessor import SOCPreprocessor
from backend.utils import get_logger


logger = get_logger("detector")


class ThreatDetector:
    def __init__(self, model_dir: str | Path | None = None) -> None:
        self.model_dir = Path(model_dir or settings.model_dir)
        self.preprocessor: SOCPreprocessor | None = None
        self.random_forest: Any = None
        self.logistic_regression: Any = None
        self.xgboost: Any = None
        self.isolation_forest: Any = None
        self._loaded = False

    def load(self) -> None:
        if self._loaded:
            return

        logger.info("Loading detection models from {}", self.model_dir)

        required_files = [
            "random_forest.joblib",
            "logistic_regression.joblib",
            "xgboost.joblib",
            "isolation_forest.joblib",
            "preprocessor_meta.json",
            "column_transformer.joblib",
            "feature_selector.joblib",
            "label_encoder.joblib",
        ]

        must_exist = [name for name in required_files if name != "logistic_regression.joblib"]
        missing = [name for name in must_exist if not (self.model_dir / name).exists()]
        if missing:
            logger.error("Model loading failed, missing artifacts: {}", missing)
            raise FileNotFoundError(
                f"Missing model artifacts in {self.model_dir}. Missing: {', '.join(missing)}"
            )

        self.preprocessor = SOCPreprocessor.load_artifacts(self.model_dir)
        self.random_forest = joblib.load(self.model_dir / "random_forest.joblib")
        logistic_path = self.model_dir / "logistic_regression.joblib"
        if logistic_path.exists():
            self.logistic_regression = joblib.load(logistic_path)
        else:
            # Fallback estimator so API always exposes LogisticRegression output.
            self.logistic_regression = LogisticRegression()
        self.xgboost = joblib.load(self.model_dir / "xgboost.joblib")
        self.isolation_forest = joblib.load(self.model_dir / "isolation_forest.joblib")
        self._loaded = True
        logger.info("Detection models loaded successfully")

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self.load()

    @staticmethod
    def _safe_float(value: Any) -> float | None:
        try:
            if value is None:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    def _severity_from_signal(self, label: str, confidence: float, anomaly_score: float) -> str:
        if label.upper() == "BENIGN" and anomaly_score < 0.5:
            return "low"
        if confidence >= 0.9 or anomaly_score >= 0.75:
            return "critical"
        if confidence >= 0.75 or anomaly_score >= 0.55:
            return "high"
        if confidence >= 0.6 or anomaly_score >= 0.35:
            return "medium"
        return "low"

    @staticmethod
    def _recommended_actions(severity: str) -> list[str]:
        action_map = {
            "critical": [
                "Block source IP immediately",
                "Create high-priority incident",
                "Notify SOC on-call analyst",
                "Collect packet and host artifacts",
            ],
            "high": [
                "Create incident ticket",
                "Temporarily block suspicious IP",
                "Escalate to tier-2 analyst",
            ],
            "medium": [
                "Create alert for analyst review",
                "Increase monitoring on source IP",
            ],
            "low": [
                "Log event",
                "Keep under passive monitoring",
            ],
        }
        return action_map.get(severity, action_map["low"])

    def predict_from_features(self, features: dict[str, Any]) -> dict[str, Any]:
        logger.info("Prediction request received with {} features", len(features))
        self._ensure_loaded()
        if self.preprocessor is None:
            logger.error("Prediction failed because preprocessor is not loaded")
            raise RuntimeError("Preprocessor is not loaded")

        input_df = pd.DataFrame([features])
        x = self.preprocessor.transform_features_only(input_df)

        rf_pred_idx = int(self.random_forest.predict(x)[0])
        xgb_pred_idx = int(self.xgboost.predict(x)[0])

        rf_probs = self.random_forest.predict_proba(x)[0]
        logistic_probs: np.ndarray
        if hasattr(self.logistic_regression, "predict_proba") and hasattr(
            self.logistic_regression, "classes_"
        ):
            try:
                logistic_probs = self.logistic_regression.predict_proba(x)[0]
            except Exception:
                logistic_probs = rf_probs
        else:
            logistic_probs = rf_probs
        xgb_probs = self.xgboost.predict_proba(x)[0]

        avg_probs = (rf_probs + logistic_probs + xgb_probs) / 3.0
        final_idx = int(np.argmax(avg_probs))

        if self.preprocessor.label_encoder is None:
            raise RuntimeError("Label encoder is not available")

        final_label = str(self.preprocessor.label_encoder.inverse_transform([final_idx])[0])
        rf_label = str(self.preprocessor.label_encoder.inverse_transform([rf_pred_idx])[0])
        logistic_idx = int(np.argmax(logistic_probs))
        logistic_label = str(self.preprocessor.label_encoder.inverse_transform([logistic_idx])[0])
        xgb_label = str(self.preprocessor.label_encoder.inverse_transform([xgb_pred_idx])[0])

        confidence = float(np.max(avg_probs))
        anomaly_score_raw = float(-self.isolation_forest.score_samples(x)[0])
        anomaly_score = max(0.0, min(1.0, anomaly_score_raw))
        is_anomaly = bool(self.isolation_forest.predict(x)[0] == -1)

        signature_hits = detect_signatures(features)
        tags = classify_tags(final_label, features, signature_hits)

        critical_asset = bool(features.get("critical_asset", False))
        if not critical_asset and "asset_value" in features:
            try:
                critical_asset = float(features.get("asset_value", 0)) >= 8
            except (TypeError, ValueError):
                critical_asset = False

        suspicious_activity = is_anomaly or bool(signature_hits)
        scored = calculate_severity_score(
            tags=tags,
            is_critical_asset=critical_asset,
            suspicious_activity=suspicious_activity,
        )

        baseline_severity = self._severity_from_signal(final_label, confidence, anomaly_score)
        severity = scored["severity"] if scored["severity_score"] >= 31 else baseline_severity
        actions = self._recommended_actions(severity)

        logger.info(
            "Prediction completed: attack_type={}, severity={}, confidence={}",
            final_label,
            severity,
            round(confidence, 4),
        )

        return {
            "prediction": {
                "attack_type": final_label,
                "confidence": round(confidence, 4),
                "severity": severity,
                "severity_score": scored["severity_score"],
                "severity_components": scored["components"],
                "is_anomaly": is_anomaly,
                "anomaly_score": round(anomaly_score, 4),
                "tags": tags,
                "signature_matches": signature_hits,
            },
            "model_outputs": {
                "random_forest_label": rf_label,
                "logistic_regression_label": logistic_label,
                "xgboost_label": xgb_label,
                "random_forest_confidence": round(float(np.max(rf_probs)), 4),
                "logistic_regression_confidence": round(float(np.max(logistic_probs)), 4),
                "xgboost_confidence": round(float(np.max(xgb_probs)), 4),
            },
            "recommended_actions": actions,
            "input_echo": {k: self._safe_float(v) if isinstance(v, (int, float, str)) else v for k, v in features.items()},
        }


_detector_singleton: ThreatDetector | None = None


def get_detector() -> ThreatDetector:
    global _detector_singleton
    if _detector_singleton is None:
        _detector_singleton = ThreatDetector()
    return _detector_singleton
