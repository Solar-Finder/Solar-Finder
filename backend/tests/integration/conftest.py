"""Integrationstests gegen ein laufendes Backend (Docker-Container oder uvicorn).

Adresse über API_BASE_URL, Standard http://localhost:8000/api/v1.
Lokal:  docker compose up -d --build   und dann (im Ordner backend/)   pytest tests/integration
"""
import os
import time

import httpx
import pytest

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000/api/v1").rstrip("/")
STARTUP_TIMEOUT_S = int(os.environ.get("API_STARTUP_TIMEOUT", "300"))  # MaStR-Download beim ersten Start

# Ungefähr Pforzheim-Innenstadt (minLon, minLat, maxLon, maxLat) – kleiner Ausschnitt mit Gebäuden
CITY_CENTER_BBOX = "8.695,48.885,8.715,48.898"


@pytest.fixture(scope="session")
def api():
    """HTTP-Client, sobald /meta antwortet (= Datenmodell geladen)."""
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    last_error = None
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{BASE_URL}/meta", timeout=30)
            if r.status_code == 200:
                break
            last_error = f"HTTP {r.status_code}"
        except httpx.HTTPError as e:
            last_error = repr(e)
        time.sleep(5)
    else:
        pytest.fail(f"Backend unter {BASE_URL} nach {STARTUP_TIMEOUT_S} s nicht bereit: {last_error}")

    with httpx.Client(base_url=BASE_URL, timeout=120) as client:
        yield client


@pytest.fixture(scope="session")
def meta(api):
    return api.get("/meta").json()


@pytest.fixture(scope="session")
def postal_codes(meta):
    return [p["value"] for p in meta["postal_codes"]]
