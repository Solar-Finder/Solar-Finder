# Backend: FastAPI + Datenbestand (LUBW, ALKIS, OSM, Preistabelle)
# Build-Kontext ist das Repository-Wurzelverzeichnis (wegen data/), siehe docker-compose.yml:
#   docker build -f backend/Dockerfile -t pv-prognose-backend .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PV_DATA_DIR=/app/data

# Zusätzliche Stammzertifikate aus certs/ (z. B. Virenscanner mit HTTPS-Prüfung, Firmen-Proxy).
# Leerer Ordner = keine Änderung. Gilt für pip beim Bauen und für Datenabrufe zur Laufzeit.
COPY certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt     PIP_CERT=/etc/ssl/certs/ca-certificates.crt     REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/app ./app
COPY data /app/data

# Ohne Root-Rechte laufen; data/ muss beschreibbar sein (Cache, OSM-Aktualisierung)
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/data/cache \
    && chown -R app:app /app/data
USER app

# data/cache (MaStR, Strompreis, Kartenkacheln) als Volume, damit es Neustarts übersteht
VOLUME ["/app/data/cache"]

EXPOSE 8000

# Gesund, sobald das Datenmodell geladen ist (beim allerersten Start ca. 1 Minute für MaStR)
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/meta', timeout=8)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75", "--proxy-headers", "--forwarded-allow-ips", "*"]
