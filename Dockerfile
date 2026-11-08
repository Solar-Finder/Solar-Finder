# Backend (FastAPI) als Container – z. B. für Render. Build-Kontext ist das Repo-Wurzelverzeichnis,
# weil das Backend die Daten aus data/ liest (Pfade relativ zu backend/app/sources/cache.py).
#   docker build -t pv-backend .
#   docker run -p 8000:8000 -e CORS_ORIGINS=http://localhost:3000 pv-backend
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /srv

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY data/ data/
COPY backend/app/ backend/app/

# Nicht als root laufen; data/ muss beschreibbar sein (MaStR-Cache in data/cache, OSM-Refresh in data/osm)
RUN useradd --create-home app && chown -R app:app /srv
USER app

WORKDIR /srv/backend
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 75 --proxy-headers --forwarded-allow-ips='*'"]
