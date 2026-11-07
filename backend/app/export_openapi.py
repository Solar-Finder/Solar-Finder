"""Schreibt den API-Vertrag nach docs/api/openapi.json (aus den Pydantic-Modellen erzeugt).

Aufruf (im Ordner backend/):  python -m app.export_openapi
"""
import json
from pathlib import Path

from .main import app

out = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi.json"
out.parent.mkdir(parents=True, exist_ok=True)
spec = app.openapi()
spec["servers"] = [{"url": "http://localhost:8000"}]
out.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"geschrieben: {out}")
