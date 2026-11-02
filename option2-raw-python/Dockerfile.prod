# Multi-stage production build for Virtual Email Server
FROM python:3.12-slim AS builder

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Final minimal production image
FROM python:3.12-slim AS runner

WORKDIR /app
COPY --from=builder /install /usr/local

# Create non-root system user
RUN groupadd -g 10001 mailgroup && \
    useradd -u 10001 -g mailgroup -s /bin/sh -m mailuser

COPY . /app
RUN mkdir -p /app/data/inbox /app/logs && \
    chown -R mailuser:mailgroup /app

USER mailuser

ENV PYTHONUNBUFFERED=1
EXPOSE 25 1025 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=2)" || exit 1

CMD ["python", "app.py"]
