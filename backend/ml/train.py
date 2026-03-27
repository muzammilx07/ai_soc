from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    precision_recall_fscore_support,
    recall_score,
    roc_curve,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from backend.config import settings
from backend.services.preprocessor import SOCPreprocessor


def detect_label_column(df: pd.DataFrame) -> str:
    for name in ["label", "attack", "class", "target"]:
        if name in df.columns:
            return name
    raise ValueError("No label column found. Expected one of: label, attack, class, target")


def imbalance_ratio(y: np.ndarray) -> float:
    counts = np.bincount(y)
    non_zero = counts[counts > 0]
    if len(non_zero) < 2:
        return 1.0
    return float(non_zero.max() / non_zero.min())


def minority_count(y: np.ndarray) -> int:
    counts = np.bincount(y)
    non_zero = counts[counts > 0]
    if len(non_zero) == 0:
        return 0
    return int(non_zero.min())


def train_models(
    data_path: Path,
    model_dir: Path,
    test_size: float = 0.2,
    random_state: int = 42,
    imbalance_threshold: float = 3.0,
    max_rows: int | None = None,
) -> dict:
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset not found: {data_path}")

    read_kwargs = {"low_memory": True}
    if max_rows is not None and max_rows > 0:
        read_kwargs["nrows"] = max_rows

    df = pd.read_csv(data_path, **read_kwargs)
    df.columns = [c.strip().lower() for c in df.columns]

    label_column = detect_label_column(df)
    preprocessor = SOCPreprocessor(label_column=label_column)

    x, y = preprocessor.fit_transform(df)

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    ratio = imbalance_ratio(y_train)
    smote_applied = ratio >= imbalance_threshold
    if smote_applied:
        min_count = minority_count(y_train)
        if min_count > 1:
            k_neighbors = min(5, min_count - 1)
            smote = SMOTE(random_state=random_state, k_neighbors=k_neighbors)
            x_train, y_train = smote.fit_resample(x_train, y_train)
        else:
            smote_applied = False

    rf = RandomForestClassifier(
        n_estimators=200,
        random_state=random_state,
        n_jobs=-1,
        class_weight="balanced_subsample",
    )
    rf.fit(x_train, y_train)

    num_classes = int(len(np.unique(y_train)))
    xgb = XGBClassifier(
        n_estimators=300,
        max_depth=8,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="multi:softprob",
        eval_metric="mlogloss",
        num_class=num_classes,
        random_state=random_state,
        n_jobs=-1,
    )
    xgb.fit(x_train, y_train)

    lr = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        solver="lbfgs",
        n_jobs=None,
    )
    lr.fit(x_train, y_train)

    iforest = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=random_state,
        n_jobs=-1,
    )
    iforest.fit(x_train)

    rf_pred = rf.predict(x_test)
    lr_pred = lr.predict(x_test)
    xgb_pred = xgb.predict(x_test)

    rf_accuracy = accuracy_score(y_test, rf_pred)
    rf_f1 = f1_score(y_test, rf_pred, average="weighted")
    xgb_accuracy = accuracy_score(y_test, xgb_pred)
    xgb_f1 = f1_score(y_test, xgb_pred, average="weighted")
    lr_accuracy = accuracy_score(y_test, lr_pred)
    lr_f1 = f1_score(y_test, lr_pred, average="weighted")

    rf_report = classification_report(y_test, rf_pred, output_dict=True)
    lr_report = classification_report(y_test, lr_pred, output_dict=True)
    xgb_report = classification_report(y_test, xgb_pred, output_dict=True)

    benign_class_name = "BENIGN"
    benign_idx = None
    if preprocessor.label_encoder is not None:
        class_names = preprocessor.label_encoder.classes_.tolist()
        if benign_class_name in class_names:
            benign_idx = class_names.index(benign_class_name)

    if benign_idx is None:
        benign_idx = 0

    y_binary_true = (y_test != benign_idx).astype(int)
    iforest_pred_raw = iforest.predict(x_test)
    y_binary_pred = (iforest_pred_raw == -1).astype(int)

    rf_probs = rf.predict_proba(x_test)
    rf_class_names = preprocessor.label_encoder.classes_.tolist() if preprocessor.label_encoder else []
    benign_prob_idx = benign_idx if benign_idx < rf_probs.shape[1] else 0
    rf_attack_scores = 1.0 - rf_probs[:, benign_prob_idx]

    rf_binary_pred = (rf_pred != benign_idx).astype(int)
    rf_precision = precision_score(y_binary_true, rf_binary_pred, zero_division=0)
    rf_recall = recall_score(y_binary_true, rf_binary_pred, zero_division=0)
    rf_f1_binary = f1_score(y_binary_true, rf_binary_pred, zero_division=0)

    fpr, tpr, thresholds = roc_curve(y_binary_true, rf_attack_scores)
    rf_roc_points = [
        {
            "threshold": round(float(thresholds[idx]), 4),
            "fpr": round(float(fpr[idx]), 4),
            "tpr": round(float(tpr[idx]), 4),
        }
        for idx in range(len(thresholds))
    ]

    label_names = [str(name) for name in rf_class_names] if rf_class_names else [str(idx) for idx in sorted(set(y_test))]
    cm = confusion_matrix(y_test, rf_pred, labels=list(range(len(label_names))))
    cm_payload: list[dict[str, int | str]] = []
    for actual_idx, actual in enumerate(label_names):
        for pred_idx, predicted in enumerate(label_names):
            cm_payload.append(
                {
                    "actual": actual,
                    "predicted": predicted,
                    "value": int(cm[actual_idx, pred_idx]),
                }
            )

    iso_precision, iso_recall, iso_f1, _ = precision_recall_fscore_support(
        y_binary_true,
        y_binary_pred,
        average="binary",
        zero_division=0,
    )

    iso_scores = -iforest.score_samples(x_test)
    try:
        iso_auc = roc_auc_score(y_binary_true, iso_scores)
    except ValueError:
        iso_auc = None

    model_dir.mkdir(parents=True, exist_ok=True)
    preprocessor.save_artifacts(model_dir)

    joblib.dump(rf, model_dir / "random_forest.joblib")
    joblib.dump(lr, model_dir / "logistic_regression.joblib")
    joblib.dump(xgb, model_dir / "xgboost.joblib")
    joblib.dump(iforest, model_dir / "isolation_forest.joblib")

    metrics = {
        "data": {
            "data_path": str(data_path),
            "rows": int(len(df)),
            "columns": int(df.shape[1]),
            "label_column": label_column,
        },
        "split": {
            "test_size": test_size,
            "random_state": random_state,
            "smote_applied": smote_applied,
            "imbalance_ratio": round(ratio, 4),
        },
        "models": {
            "random_forest": {
                "accuracy": round(float(rf_accuracy), 4),
                "weighted_f1": round(float(rf_f1), 4),
                "precision": round(float(rf_precision), 4),
                "recall": round(float(rf_recall), 4),
                "binary_f1": round(float(rf_f1_binary), 4),
                "report": rf_report,
                "confusion_matrix": cm_payload,
                "roc_curve": rf_roc_points,
                "roc_auc": round(float(roc_auc_score(y_binary_true, rf_attack_scores)), 4),
            },
            "logistic_regression": {
                "accuracy": round(float(lr_accuracy), 4),
                "weighted_f1": round(float(lr_f1), 4),
                "report": lr_report,
            },
            "xgboost": {
                "accuracy": round(float(xgb_accuracy), 4),
                "weighted_f1": round(float(xgb_f1), 4),
                "report": xgb_report,
            },
            "isolation_forest": {
                "precision": round(float(iso_precision), 4),
                "recall": round(float(iso_recall), 4),
                "f1": round(float(iso_f1), 4),
                "roc_auc": round(float(iso_auc), 4) if iso_auc is not None else None,
            },
        },
        "label_classes": preprocessor.label_encoder.classes_.tolist() if preprocessor.label_encoder else [],
        "saved_artifacts": [
            "imputer.joblib",
            "scaler.joblib",
            "label_encoder.joblib",
            "categorical_encoder.joblib",
            "column_transformer.joblib",
            "feature_selector.joblib",
            "selected_features.json",
            "preprocessor_meta.json",
            "random_forest.joblib",
            "logistic_regression.joblib",
            "xgboost.joblib",
            "isolation_forest.joblib",
        ],
    }

    with (model_dir / "training_metrics.json").open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train SOC ML models")
    parser.add_argument(
        "--data-path",
        type=Path,
        default=Path("data/processed/cicids_2017_merged_clean.csv"),
        help="Path to cleaned CICIDS dataset",
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path(settings.model_dir),
        help="Directory to save models and metadata",
    )
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--imbalance-threshold", type=float, default=3.0)
    parser.add_argument("--max-rows", type=int, default=None)
    args = parser.parse_args()

    metrics = train_models(
        data_path=args.data_path,
        model_dir=args.model_dir,
        test_size=args.test_size,
        random_state=args.random_state,
        imbalance_threshold=args.imbalance_threshold,
        max_rows=args.max_rows,
    )

    print("Training complete. Metrics summary:")
    print(json.dumps({
        "random_forest_f1": metrics["models"]["random_forest"]["weighted_f1"],
        "xgboost_f1": metrics["models"]["xgboost"]["weighted_f1"],
        "isolation_forest_f1": metrics["models"]["isolation_forest"]["f1"],
        "smote_applied": metrics["split"]["smote_applied"],
    }, indent=2))


if __name__ == "__main__":
    main()
