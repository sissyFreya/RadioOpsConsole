set("log.stdout", true)
set("log.level", 2)
settings.init.allow_root.set(true)

# Per-radio configuration — all values come from environment variables.
# When running multiple radios, each gets its own container with distinct env.
radio_id = getenv("RADIO_ID")
radio_id = if radio_id == "" then "1" else radio_id end

radio_mount = getenv("RADIO_MOUNT")
radio_mount = if radio_mount == "" then "/radio_" ^ radio_id else radio_mount end

telnet_port = int_of_string(default=1234, getenv("LIQUIDSOAP_TELNET_PORT"))
ingest_port = int_of_string(default=8001, getenv("LIVE_INGEST_PORT"))

ingest_password = getenv("LIVE_INGEST_PASSWORD")
ingest_password = if ingest_password == "" then "djpass" else ingest_password end

# Telnet control server (internal, used by the agent)
set("server.telnet", true)
set("server.telnet.bind_addr", "0.0.0.0")
set("server.telnet.port", telnet_port)

# AutoDJ playlist for this radio
playlist_dir = "/data/radios/radio_" ^ radio_id ^ "/tracks"
autodj = playlist(playlist_dir, reload=10, mode="normal", id="autodj")

# Jukebox: on-demand track requests (priority queue)
jukebox = request.queue(id="jukebox")

# Register playlist control commands
server.register("playlist.skip", fun (_) ->
  begin
    source.skip(autodj)
    "skipped"
  end
)

server.register("playlist.push", fun(uri) ->
  begin
    r = request.create(uri)
    jukebox.push(r)
    "pushed=" ^ uri
  end
)

server.register("playlist.mode", fun(mode) ->
  begin
    "mode=" ^ mode
  end
)

# DJ live ingest: connect your PC to this Liquidsoap instance
live_in = input.harbor("live", port=ingest_port, password=ingest_password, icy=true)

# Connecting alone must NOT cut AutoDJ (you explicitly enable takeover)
live_enabled = ref(false)

def live_connected() =
  source.is_ready(live_in)
end

server.register("takeover.enable", fun (_) ->
  begin
    live_enabled := true
    "enabled=true"
  end
)

server.register("takeover.disable", fun (_) ->
  begin
    live_enabled := false
    "enabled=false"
  end
)

server.register("takeover.status", fun (_) ->
  "enabled=" ^ string_of(!live_enabled) ^
  " connected=" ^ string_of(live_connected())
)

live_gate =
  switch([
    ({ !live_enabled }, blank()),
    ({ true }, live_in)
  ])

# Priority: jukebox (requested tracks) → live (if enabled) → autodj → silence
s0 = fallback(track_sensitive=false, [jukebox, live_gate, autodj, blank()])

s = mksafe(s0)

output.icecast(
  %mp3(bitrate=128),
  host="icecast",
  port=8000,
  password="sourcepass",
  mount=radio_mount,
  name="RadioOps Radio " ^ radio_id,
  description="AutoDJ + controlled DJ takeover",
  s
)
