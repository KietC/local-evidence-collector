"""Bounded local paths for the integrated market discovery commands."""
from __future__ import annotations

from pathlib import Path
import stat

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def checked(path: Path) -> Path:
    path = path.absolute()
    for ancestor in [path, *path.parents]:
        if ancestor.exists() or ancestor.is_symlink():
            info = ancestor.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                raise ValueError("REPARSE_PATH_FORBIDDEN")
    return path.resolve()


def validate_location(path: Path) -> Path:
    path = checked(path)
    private_parts = {"cases", "training_runs", "profiles", "sessions", "browser", "cookies", "mail", "emails", "customer_exports"}
    if any(part.casefold() in private_parts for part in path.parts):
        raise ValueError("PRIVATE_RUNTIME_ROOT_REFUSED")
    if path == Path(path.anchor):
        raise ValueError("FILESYSTEM_ROOT_REFUSED")
    if path == REPOSITORY_ROOT or REPOSITORY_ROOT in path.parents:
        runtime = REPOSITORY_ROOT / "runtime"
        if path != runtime and runtime not in path.parents:
            raise ValueError("SOURCE_TREE_RUNTIME_REFUSED")
    return path


def runtime_child(root: Path, value: Path | str) -> Path:
    root = validate_location(root)
    candidate = checked(root / value)
    if candidate == root or root not in candidate.parents:
        raise ValueError("PATH_OUTSIDE_RUNTIME")
    return candidate
