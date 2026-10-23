import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="teacher-test-"))
os.environ["DATA_DIR"] = str(_tmp)
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
