FROM node:20-bookworm-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV NEKO_HOST=0.0.0.0
ENV NEKO_PORT=8765
ENV NEKO_AUTO_BACKUP_ENABLED=true
ENV NEKO_AUTO_BACKUP_TIME=03:00
ENV NEKO_MAX_LOCAL_BACKUPS=3

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/me', timeout=3)"

CMD ["python3", "./backend/server.py"]
