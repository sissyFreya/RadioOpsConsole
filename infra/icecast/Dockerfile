FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends icecast2 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY icecast.xml /etc/icecast2/icecast.xml

EXPOSE 8000

CMD ["icecast2", "-n", "-c", "/etc/icecast2/icecast.xml"]
