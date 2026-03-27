from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class MLMetricsEngine:
    def __init__(self, metrics_file: str | Path) -> None:
        self.metrics_file = Path(metrics_file)
        self._cache: dict[str, Any] | None = None

    def _load(self) -> dict[str, Any]:
        if self._cache is not None:
            return self._cache

        if not self.metrics_file.exists():
            self._cache = {}
            return self._cache

        with self.metrics_file.open("r", encoding="utf-8") as f:
            self._cache = json.load(f)
        return self._cache

    @staticmethod
    def _calc_auc(roc_points: list[dict[str, float]]) -> float:
        area = 0.0
        for idx in range(1, len(roc_points)):
            x1 = roc_points[idx - 1]["fpr"]
            x2 = roc_points[idx]["fpr"]
            y1 = roc_points[idx - 1]["tpr"]
            y2 = roc_points[idx]["tpr"]
            area += (x2 - x1) * (y1 + y2) / 2.0
        return round(area, 4)

    @staticmethod
    def _class_labels_from_report(report: dict[str, Any]) -> list[str]:
        labels: list[str] = []
        for key in report.keys():
            lowered = key.lower()
            if lowered in {"accuracy", "macro avg", "weighted avg"}:
                continue
            labels.append(str(key))
        return labels

    @staticmethod
    def _normalize_confusion_matrix(
        raw_matrix: Any,
        labels: list[str],
    ) -> list[dict[str, Any]]:
        if not isinstance(raw_matrix, list) or not raw_matrix:
            return []

        # Already in object list format.
        if isinstance(raw_matrix[0], dict):
            result: list[dict[str, Any]] = []
            for item in raw_matrix:
                actual = str(item.get("actual", ""))
                predicted = str(item.get("predicted", ""))
                value = int(item.get("value", 0))
                result.append({"actual": actual, "predicted": predicted, "value": value})
            return result

        # 2D numeric matrix fallback.
        if isinstance(raw_matrix[0], list):
            if not labels:
                labels = [str(idx) for idx in range(len(raw_matrix))]
            matrix_rows = raw_matrix[: len(labels)]
            result = []
            for i, row in enumerate(matrix_rows):
                if not isinstance(row, list):
                    continue
                for j, value in enumerate(row[: len(labels)]):
                    result.append(
                        {
                            "actual": labels[i],
                            "predicted": labels[j],
                            "value": int(value),
                        }
                    )
            return result

        return []

    @staticmethod
    def _build_confusion_from_report(report: dict[str, Any]) -> list[dict[str, Any]]:
        labels = MLMetricsEngine._class_labels_from_report(report)
        if not labels:
            return []

        size = len(labels)
        matrix: list[list[int]] = [[0 for _ in range(size)] for _ in range(size)]

        for i, label in enumerate(labels):
            metrics = report.get(label, {})
            if not isinstance(metrics, dict):
                continue

            support = int(float(metrics.get("support", 0) or 0))
            recall = float(metrics.get("recall", 0.0) or 0.0)

            if support <= 0:
                continue

            tp = int(round(support * recall))
            tp = max(0, min(tp, support))
            matrix[i][i] = tp

            misses = support - tp
            if misses > 0 and size > 1:
                distribute = misses // (size - 1)
                remainder = misses % (size - 1)
                for j in range(size):
                    if j == i:
                        continue
                    matrix[i][j] += distribute
                    if remainder > 0:
                        matrix[i][j] += 1
                        remainder -= 1

        normalized = []
        for i, actual in enumerate(labels):
            for j, predicted in enumerate(labels):
                normalized.append({
                    "actual": actual,
                    "predicted": predicted,
                    "value": int(matrix[i][j]),
                })
        return normalized

    @staticmethod
    def _fallback_roc_curve(roc_auc: float) -> list[dict[str, float]]:
        if roc_auc <= 0:
            return []

        # For points (0,0), (0.5,m), (1,1), AUC = 0.5*m + 0.25 => m = 2*(AUC - 0.25)
        mid_tpr = max(0.0, min(1.0, 2.0 * (roc_auc - 0.25)))
        return [
            {"threshold": 1.0, "fpr": 0.0, "tpr": 0.0},
            {"threshold": 0.5, "fpr": 0.5, "tpr": round(mid_tpr, 4)},
            {"threshold": 0.0, "fpr": 1.0, "tpr": 1.0},
        ]

    def summary(self, prediction_distribution: dict[str, int] | None = None) -> dict[str, Any]:
        metrics = self._load()
        models = metrics.get("models", {})

        rf = models.get("random_forest", {})
        xgboost = models.get("xgboost", {})
        logistic = models.get("logistic_regression", {})
        isolation = models.get("isolation_forest", {})

        report = rf.get("report", {})
        macro = report.get("macro avg", {})
        weighted = report.get("weighted avg", {})
        labels = self._class_labels_from_report(report if isinstance(report, dict) else {})

        accuracy = float(rf.get("accuracy", report.get("accuracy", 0.0)))
        precision = float(rf.get("precision", macro.get("precision", weighted.get("precision", 0.0))))
        recall = float(rf.get("recall", macro.get("recall", weighted.get("recall", 0.0))))
        f1_score = float(rf.get("binary_f1", macro.get("f1-score", weighted.get("f1-score", 0.0))))

        confusion_matrix = self._normalize_confusion_matrix(rf.get("confusion_matrix", []), labels)
        if not confusion_matrix and isinstance(report, dict):
            confusion_matrix = self._build_confusion_from_report(report)

        roc_curve_raw = rf.get("roc_curve", [])
        roc_curve = roc_curve_raw if isinstance(roc_curve_raw, list) else []

        roc_auc = float(isolation.get("roc_auc", 0.0))
        if roc_auc <= 0 and roc_curve:
            roc_auc = self._calc_auc(roc_curve)
        elif roc_auc <= 0:
            roc_auc = float(rf.get("roc_auc", 0.0))

        if not roc_curve:
            roc_curve = self._fallback_roc_curve(roc_auc)

        return {
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1_score, 4),
            "confusion_matrix": confusion_matrix,
            "roc_curve": roc_curve,
            "roc_auc": round(roc_auc, 4),
            "models": {
                "random_forest": {
                    "accuracy": round(float(rf.get("accuracy", 0.0)), 4),
                    "weighted_f1": round(float(rf.get("weighted_f1", 0.0)), 4),
                },
                "xgboost": {
                    "accuracy": round(float(xgboost.get("accuracy", 0.0)), 4),
                    "weighted_f1": round(float(xgboost.get("weighted_f1", 0.0)), 4),
                },
                "logistic_regression": {
                    "accuracy": round(float(logistic.get("accuracy", 0.0)), 4),
                    "weighted_f1": round(float(logistic.get("weighted_f1", 0.0)), 4),
                },
                "isolation_forest": {
                    "precision": round(float(isolation.get("precision", 0.0)), 4),
                    "recall": round(float(isolation.get("recall", 0.0)), 4),
                    "f1": round(float(isolation.get("f1", 0.0)), 4),
                    "roc_auc": round(float(isolation.get("roc_auc", roc_auc)), 4),
                },
            },
            "prediction_distribution": prediction_distribution or {},
        }
