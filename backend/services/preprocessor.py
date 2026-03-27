from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_selection import VarianceThreshold
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler

from backend.config import settings


DEFAULT_LABEL_MAP = {
    "BENIGN": "BENIGN",
    "DDoS": "DDoS",
    "DoS": "DoS",
    "PortScan": "PortScan",
    "Bot": "Botnet",
    "FTP-Patator": "BruteForce",
    "SSH-Patator": "BruteForce",
    "Web Attack - Brute Force": "WebAttack",
    "Web Attack - XSS": "WebAttack",
    "Web Attack - Sql Injection": "WebAttack",
    "Infiltration": "Infiltration",
}


@dataclass
class SOCPreprocessor:
    label_column: str = "label"
    drop_columns: list[str] = field(default_factory=list)
    label_map: dict[str, str] = field(default_factory=lambda: DEFAULT_LABEL_MAP.copy())

    imputer: SimpleImputer | None = None
    scaler: StandardScaler | None = None
    categorical_encoder: OneHotEncoder | None = None
    label_encoder: LabelEncoder | None = None
    column_transformer: ColumnTransformer | None = None
    selector: VarianceThreshold | None = None

    numeric_columns: list[str] = field(default_factory=list)
    categorical_columns: list[str] = field(default_factory=list)
    selected_features: list[str] = field(default_factory=list)

    @staticmethod
    def _clean_column_name(name: str) -> str:
        clean = name.strip().lower()
        clean = re.sub(r"[^a-z0-9]+", "_", clean)
        clean = re.sub(r"_+", "_", clean).strip("_")
        return clean

    @staticmethod
    def _sanitize_values(df: pd.DataFrame) -> pd.DataFrame:
        cleaned = df.copy()
        cleaned.columns = [SOCPreprocessor._clean_column_name(c) for c in cleaned.columns]

        numeric_cols = cleaned.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) > 0:
            cleaned[numeric_cols] = cleaned[numeric_cols].replace([np.inf, -np.inf], np.nan)

        return cleaned

    def _map_labels(self, y: pd.Series) -> pd.Series:
        mapped = y.astype(str).str.strip()
        return mapped.map(lambda v: self.label_map.get(v, v))

    def _split_xy(self, df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
        clean_df = self._sanitize_values(df)

        if self.label_column not in clean_df.columns:
            raise ValueError(f"Label column '{self.label_column}' not found in dataset")

        drop = {self.label_column, *self.drop_columns}
        x = clean_df[[c for c in clean_df.columns if c not in drop]].copy()
        y = self._map_labels(clean_df[self.label_column])
        return x, y

    def fit_transform(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        x, y = self._split_xy(df)

        self.numeric_columns = x.select_dtypes(include=[np.number]).columns.tolist()
        self.categorical_columns = [c for c in x.columns if c not in self.numeric_columns]

        self.imputer = SimpleImputer(strategy="median")
        self.scaler = StandardScaler()
        self.categorical_encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        self.label_encoder = LabelEncoder()

        numeric_pipeline = Pipeline(
            steps=[
                ("imputer", self.imputer),
                ("scaler", self.scaler),
            ]
        )

        categorical_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", self.categorical_encoder),
            ]
        )

        transformers: list[tuple[str, Pipeline, list[str]]] = []
        if self.numeric_columns:
            transformers.append(("num", numeric_pipeline, self.numeric_columns))
        if self.categorical_columns:
            transformers.append(("cat", categorical_pipeline, self.categorical_columns))

        if not transformers:
            raise ValueError("No usable features found after preprocessing")

        self.column_transformer = ColumnTransformer(transformers=transformers)

        x_transformed = self.column_transformer.fit_transform(x)
        y_encoded = self.label_encoder.fit_transform(y)

        feature_names = self.column_transformer.get_feature_names_out().tolist()
        self.selector = VarianceThreshold(threshold=0.0)
        x_selected = self.selector.fit_transform(x_transformed)

        support_mask = self.selector.get_support()
        self.selected_features = [name for name, keep in zip(feature_names, support_mask) if keep]

        return x_selected, y_encoded

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        if self.column_transformer is None or self.selector is None:
            raise ValueError("Preprocessor is not fitted. Call fit_transform first or load artifacts.")

        x, _ = self._split_xy(df)
        x_transformed = self.column_transformer.transform(x)
        x_selected = self.selector.transform(x_transformed)
        return x_selected

    def transform_features_only(self, feature_df: pd.DataFrame) -> np.ndarray:
        if self.column_transformer is None or self.selector is None:
            raise ValueError("Preprocessor is not fitted. Call fit_transform first or load artifacts.")

        clean_df = self._sanitize_values(feature_df)
        x_transformed = self.column_transformer.transform(clean_df)
        x_selected = self.selector.transform(x_transformed)
        return x_selected

    def save_artifacts(self, output_dir: str | Path | None = None) -> None:
        if (
            self.imputer is None
            or self.scaler is None
            or self.label_encoder is None
            or self.column_transformer is None
            or self.selector is None
        ):
            raise ValueError("Preprocessor is not fitted. Nothing to save.")

        artifacts_dir = Path(output_dir or settings.model_dir)
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        joblib.dump(self.imputer, artifacts_dir / "imputer.joblib")
        joblib.dump(self.scaler, artifacts_dir / "scaler.joblib")
        joblib.dump(self.label_encoder, artifacts_dir / "label_encoder.joblib")
        joblib.dump(self.categorical_encoder, artifacts_dir / "categorical_encoder.joblib")
        joblib.dump(self.column_transformer, artifacts_dir / "column_transformer.joblib")
        joblib.dump(self.selector, artifacts_dir / "feature_selector.joblib")

        with (artifacts_dir / "selected_features.json").open("w", encoding="utf-8") as f:
            json.dump(self.selected_features, f, indent=2)

        with (artifacts_dir / "preprocessor_meta.json").open("w", encoding="utf-8") as f:
            json.dump(
                {
                    "label_column": self.label_column,
                    "drop_columns": self.drop_columns,
                    "numeric_columns": self.numeric_columns,
                    "categorical_columns": self.categorical_columns,
                },
                f,
                indent=2,
            )

    @classmethod
    def load_artifacts(cls, artifacts_dir: str | Path | None = None) -> "SOCPreprocessor":
        base_dir = Path(artifacts_dir or settings.model_dir)

        with (base_dir / "preprocessor_meta.json").open("r", encoding="utf-8") as f:
            meta = json.load(f)

        preprocessor = cls(
            label_column=meta.get("label_column", "label"),
            drop_columns=meta.get("drop_columns", []),
        )

        preprocessor.imputer = joblib.load(base_dir / "imputer.joblib")
        preprocessor.scaler = joblib.load(base_dir / "scaler.joblib")
        preprocessor.label_encoder = joblib.load(base_dir / "label_encoder.joblib")
        preprocessor.categorical_encoder = joblib.load(base_dir / "categorical_encoder.joblib")
        preprocessor.column_transformer = joblib.load(base_dir / "column_transformer.joblib")
        preprocessor.selector = joblib.load(base_dir / "feature_selector.joblib")

        with (base_dir / "selected_features.json").open("r", encoding="utf-8") as f:
            preprocessor.selected_features = json.load(f)

        preprocessor.numeric_columns = meta.get("numeric_columns", [])
        preprocessor.categorical_columns = meta.get("categorical_columns", [])
        return preprocessor
