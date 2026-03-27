from __future__ import annotations

import sys
from pathlib import Path

from loguru import logger


def setup_logging(log_level: str = "INFO", log_file: str = "logs/app.log"):
    logger.remove()

    logger.add(
        sys.stdout,
        level=log_level.upper(),
        backtrace=False,
        diagnose=False,
        enqueue=True,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} | {message}",
    )

    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger.add(
        str(log_path),
        level=log_level.upper(),
        rotation="10 MB",
        retention="7 days",
        enqueue=True,
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} | {message}",
    )

    return logger


def get_logger(name: str):
    return logger.bind(component=name)
