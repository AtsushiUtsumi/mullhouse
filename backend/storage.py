"""Range storage backend selection."""

from __future__ import annotations

from pathlib import Path

from hand_ranges_api import hand_range_storage
from range_storage_sqlite import create_sqlite_range_storage


def create_range_storage(project_dir: Path):
    return create_sqlite_range_storage(project_dir, hand_range_storage)
