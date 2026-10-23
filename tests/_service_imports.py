"""Import independent services without sharing their generic module names.

Production services run in separate processes. Tests share a process, so the
ingestion adapters' legacy ``from models`` imports must be scoped while loading.
This keeps their real ORM classes and does not mock or replace service behavior.
"""

from contextlib import contextmanager
import importlib.util
from pathlib import Path
import sys


@contextmanager
def ingestion_model_imports():
    from services.ingestion import models

    missing = object()
    previous = sys.modules.get("models", missing)
    sys.modules["models"] = models
    try:
        yield
    finally:
        if previous is missing:
            sys.modules.pop("models", None)
        else:
            sys.modules["models"] = previous


def load_fusion_engine():
    name = "_ehr_test_fusion_engine"
    if name not in sys.modules:
        source = Path(__file__).resolve().parents[1] / "services" / "clinical-processing" / "fusion" / "engine.py"
        spec = importlib.util.spec_from_file_location(name, source)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name].ClinicalFusionEngine
