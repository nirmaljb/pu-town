#!/usr/bin/env bash
set -euo pipefail
# Run from any directory; all downloads and credentials remain checkout-local.
voice_root="$(cd "$(dirname "$0")/../.." && pwd)"
voice_dir="$voice_root/.scratch/voice/local"
voice_version=1.13.7
voice_checksum=6634aeeb2fb1366b6723708ae4320b9d5408106a4c63457c5e845ae3979c90e2
voice_source_commit=8d11efdfcd4220092b6ac7b8a21af28526da5a6b
# Validate the platform before downloading or creating credentials. The release
# has no macOS binary; build its pinned official source with the local Go toolchain.
case "$(uname -s)/$(uname -m)" in
  Linux/x86_64) voice_platform=linux_amd64 ;;
  Darwin/arm64|Darwin/x86_64) voice_platform=darwin ;;
  *) printf 'Unsupported platform: %s/%s\n' "$(uname -s)" "$(uname -m)" >&2; exit 1 ;;
esac
umask 077
mkdir -p "$voice_dir"
if [[ ! -x "$voice_dir/livekit-server" ]]; then
  if [[ "$voice_platform" == darwin ]]; then
    command -v go >/dev/null || { printf 'Install Go to build LiveKit on macOS.\n' >&2; exit 1; }
    voice_source="$voice_dir/source-$voice_version"
    if [[ ! -d "$voice_source/.git" ]]; then
      git clone --depth 1 --branch "v$voice_version" https://github.com/livekit/livekit.git "$voice_source"
    fi
    [[ "$(git -C "$voice_source" rev-parse HEAD)" == "$voice_source_commit" ]] || {
      printf 'LiveKit source does not match the pinned release commit.\n' >&2; exit 1;
    }
    (cd "$voice_source" && go build -mod=readonly -o "$voice_dir/livekit-server" ./cmd/server)
  else
    curl --fail --location "https://github.com/livekit/livekit/releases/download/v${voice_version}/livekit_${voice_version}_linux_amd64.tar.gz" --output "$voice_dir/server.tar.gz"
    (cd "$voice_dir" && echo "$voice_checksum  server.tar.gz" | sha256sum --check)
    tar -xzf "$voice_dir/server.tar.gz" -C "$voice_dir" livekit-server
  fi
fi
if [[ ! -f "$voice_dir/local.env" ]]; then
  voice_secret="$(openssl rand -hex 32)"
  cat > "$voice_dir/local.env" <<ENV
export PUTOWN_VOICE_SERVER=http://127.0.0.1:7880
export PUTOWN_VOICE_KEY=putown-local
export PUTOWN_VOICE_SECRET=$voice_secret
ENV
fi
source "$voice_dir/local.env"
cat > "$voice_dir/livekit.yaml" <<CONFIG
port: 7880
bind_addresses: [127.0.0.1]
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: 127.0.0.1
keys:
  $PUTOWN_VOICE_KEY: $PUTOWN_VOICE_SECRET
CONFIG
printf 'Backend environment: source %s/local.env\n' "$voice_dir"
exec "$voice_dir/livekit-server" --config "$voice_dir/livekit.yaml"
