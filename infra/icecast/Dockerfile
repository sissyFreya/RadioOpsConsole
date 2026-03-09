FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends icecast2 ca-certificates gettext-base \
  && rm -rf /var/lib/apt/lists/*

COPY icecast.xml.template /etc/icecast2/icecast.xml.template

ENV ICECAST_SOURCE_PASSWORD=sourcepass \
    ICECAST_RELAY_PASSWORD=relaypass \
    ICECAST_ADMIN_USER=admin \
    ICECAST_ADMIN_PASSWORD=adminpass

EXPOSE 8000

CMD ["/bin/sh", "-c", "envsubst < /etc/icecast2/icecast.xml.template > /etc/icecast2/icecast.xml && icecast2 -n -c /etc/icecast2/icecast.xml"]
