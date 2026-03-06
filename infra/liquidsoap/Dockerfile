FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends liquidsoap ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY radio.liq /etc/liquidsoap/radio.liq

VOLUME ["/data"]

CMD ["liquidsoap", "/etc/liquidsoap/radio.liq"]
