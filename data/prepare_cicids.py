from __future__ import annotations

import argparse
from pathlib import Path
import re

import numpy as np
import pandas as pd


RAW_DATA_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")
EDA_DIR = PROCESSED_DIR / "eda"


def clean_column_name(name: str) -> str:
    cleaned = name.strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned


def find_label_column(df: pd.DataFrame) -> str:
    candidates = ["label", "attack", "class", "target"]
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    raise ValueError("Could not find a label column. Expected one of: label, attack, class, target")


def load_and_merge_csvs(raw_dir: Path, max_rows_per_file: int | None = None) -> pd.DataFrame:
    csv_files = sorted(raw_dir.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {raw_dir.resolve()}")

    frames: list[pd.DataFrame] = []
    for file in csv_files:
        # Use parser defaults that are less memory-intensive for very large CICIDS files.
        read_kwargs = {
            "low_memory": True,
            "on_bad_lines": "skip",
        }
        if max_rows_per_file is not None and max_rows_per_file > 0:
            read_kwargs["nrows"] = max_rows_per_file

        df = pd.read_csv(file, **read_kwargs)
        df.columns = [clean_column_name(c) for c in df.columns]
        frames.append(df)
        print(f"Loaded {file.name}: {len(df)} rows, {len(df.columns)} columns")

    merged = pd.concat(frames, ignore_index=True)
    print(f"Merged dataset shape: {merged.shape}")
    return merged


def clean_values(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()

    numeric_cols = cleaned.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        cleaned[numeric_cols] = cleaned[numeric_cols].replace([np.inf, -np.inf], np.nan)

    return cleaned


def build_eda_outputs(df: pd.DataFrame, label_col: str) -> None:
    EDA_DIR.mkdir(parents=True, exist_ok=True)

    label_dist = (
        df[label_col]
        .astype(str)
        .value_counts(dropna=False)
        .rename_axis("label")
        .reset_index(name="count")
    )
    label_dist["percentage"] = (label_dist["count"] / len(df) * 100).round(4)
    label_dist.to_csv(EDA_DIR / "label_distribution.csv", index=False)

    missing = df.isna().sum().rename("missing_count").reset_index()
    missing.columns = ["column", "missing_count"]
    missing["missing_pct"] = (missing["missing_count"] / len(df) * 100).round(4)
    missing = missing.sort_values("missing_count", ascending=False)
    missing.to_csv(EDA_DIR / "missing_values.csv", index=False)

    numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != label_col]
    if numeric_cols:
        distribution = df[numeric_cols].describe(percentiles=[0.01, 0.05, 0.5, 0.95, 0.99]).T
        distribution.to_csv(EDA_DIR / "feature_distribution_summary.csv")

    print("Saved EDA outputs:")
    print(f"- {EDA_DIR / 'label_distribution.csv'}")
    print(f"- {EDA_DIR / 'missing_values.csv'}")
    if numeric_cols:
        print(f"- {EDA_DIR / 'feature_distribution_summary.csv'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare CICIDS 2017 data for SOC model training")
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=RAW_DATA_DIR,
        help="Directory containing raw CICIDS CSV files",
    )
    parser.add_argument(
        "--save-merged",
        action="store_true",
        help="Save merged, cleaned dataset to data/processed/cicids_2017_merged_clean.csv",
    )
    parser.add_argument(
        "--max-rows-per-file",
        type=int,
        default=None,
        help="Optional cap on rows to read from each CSV (useful on low-memory machines)",
    )
    args = parser.parse_args()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    df = load_and_merge_csvs(args.raw_dir, max_rows_per_file=args.max_rows_per_file)
    df = clean_values(df)
    label_col = find_label_column(df)

    print("Label preview:")
    print(df[label_col].astype(str).value_counts().head(20))

    build_eda_outputs(df, label_col)

    if args.save_merged:
        merged_path = PROCESSED_DIR / "cicids_2017_merged_clean.csv"
        df.to_csv(merged_path, index=False)
        print(f"Saved merged dataset to {merged_path}")


if __name__ == "__main__":
    main()
