import sys
from pathlib import Path


def get_base_path() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass is not None:
        return Path(meipass)
    return Path(__file__).parent.parent
