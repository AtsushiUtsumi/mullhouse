"""Range storage backend selection."""

from __future__ import annotations

import os
from pathlib import Path

from storage_fs import FilesystemRangeStorage


def create_range_storage(base_dir: Path, project_dir: Path):
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        from storage_db import DatabaseRangeStorage

        storage = DatabaseRangeStorage(project_dir, database_url)
        storage.init_schema()
        storage.seed_from_directory(base_dir)
        return storage
    return FilesystemRangeStorage(base_dir, project_dir)
