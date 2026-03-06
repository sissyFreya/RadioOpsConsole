set("log.stdout", true)
set("log.level", 2)
settings.init.allow_root.set(true)

# Telnet control server (internal, used by the agent)
set("server.telnet", true)
set("server.telnet.bind_addr", "0.0.0.0")
set("server.telnet.port", 1234)

# AutoDJ playlist
radio_id = getenv("RADIO_ID")
radio_id =
  if radio_id == "" then
    "1"
  else
    radio_id
  end
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
    # mode = "shuffle" or "normal" — toggle autodj mode at next reload
    # (requires playlist reload; just acknowledge here)
    "mode=" ^ mode
  end
)

# DJ live ingest: connect your PC to Liquidsoap (NOT Icecast)
live_in = input.harbor("live", port=8001, password="djpass", icy=true)

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

# Smooth transitions
s = mksafe(s0)

# Stable listener mount
output.icecast(
  %mp3(bitrate=128),
  host="icecast",
  port=8000,
  password="sourcepass",
  mount="/stream",
  name="Demo RadioOps Stream",
  description="AutoDJ + controlled DJ takeover",
  s
)
