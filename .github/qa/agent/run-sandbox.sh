#!/usr/bin/env bash
set -euo pipefail

context_file=${1:?usage: run-sandbox.sh CONTEXT_FILE REPORT_FILE}
report_file=${2:?usage: run-sandbox.sh CONTEXT_FILE REPORT_FILE}
workspace=${GITHUB_WORKSPACE:-$PWD}
run_suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
internal_network="qa-internal-${run_suffix}"
egress_network="qa-egress-${run_suffix}"
relay_name="qa-relay-${run_suffix}"
dns_name="qa-dns-${run_suffix}"
dashboard_name="qa-dashboard-${run_suffix}"
mock_name="qa-mock-${run_suffix}"
agent_name="qa-browser-${run_suffix}"
agent_image="qa-browser-use:${run_suffix}"
relay_image="qa-litellm-relay:${run_suffix}"
dns_image="qa-dns-sinkhole:${run_suffix}"
bridge=""
host_gateway_ip=""
host_test_pid=""
host_test_port=18082
host_ingress_blocked=false

: "${QA_EXPLORER_LITELLM_API_KEY:?Missing dedicated Browser Explorer key}"
: "${QA_EXPLORER_MODEL:?Missing Browser Explorer model}"

cleanup() {
  # Remove the model-code container and all fixtures before lifting the host firewall.
  docker rm -f "$agent_name" "$mock_name" "$dashboard_name" "$dns_name" "$relay_name" >/dev/null 2>&1 || true
  docker network rm "$internal_network" "$egress_network" >/dev/null 2>&1 || true
  if [ -n "$host_test_pid" ]; then
    kill "$host_test_pid" >/dev/null 2>&1 || true
  fi
  if [ "$host_ingress_blocked" = true ] && [ -n "$bridge" ] \
      && ! docker network inspect "$internal_network" >/dev/null 2>&1; then
    sudo iptables -D INPUT -i "$bridge" -j DROP >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Build the trusted sandbox images before the secret is passed to any container.
docker build --pull -f .github/qa/agent/Dockerfile.browser -t "$agent_image" .github/qa/agent >/dev/null
docker build --pull -f .github/qa/agent/Dockerfile.relay -t "$relay_image" .github/qa/agent >/dev/null
docker build --pull -f .github/qa/agent/Dockerfile.dns -t "$dns_image" .github/qa/agent >/dev/null
docker pull node:22-bookworm-slim >/dev/null

docker network create --internal "$internal_network" >/dev/null
docker network create "$egress_network" >/dev/null
# Block all traffic entering the runner host from this dedicated bridge. This is
# separate from Docker's internal-network egress isolation, which still permits
# containers to reach host services through the bridge gateway on some hosts.
network_id=$(docker network inspect -f '{{.Id}}' "$internal_network")
bridge="br-${network_id:0:12}"
sudo iptables -I INPUT 1 -i "$bridge" -j DROP
host_ingress_blocked=true
host_gateway_ip=$(docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$internal_network")
# Start a temporary listener on the host bridge address so the sandbox can prove
# that host-gateway access is blocked (rather than merely finding a closed port).
python3 -c 'import socket,sys,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind((sys.argv[1],int(sys.argv[2]))); s.listen(8); time.sleep(900)' "$host_gateway_ip" "$host_test_port" >/dev/null 2>&1 &
host_test_pid=$!
host_listener_ready=false
for _ in $(seq 1 20); do
  if python3 -c 'import socket,sys; s=socket.create_connection((sys.argv[1],int(sys.argv[2])),timeout=1); s.close()' "$host_gateway_ip" "$host_test_port" >/dev/null 2>&1; then
    host_listener_ready=true
    break
  fi
  sleep 0.1
done
if [ "$host_listener_ready" != true ]; then
  echo "Could not start the host-gateway isolation probe."
  exit 1
fi

# Docker's embedded DNS forwards external names to this sinkhole, which only
# returns NXDOMAIN and never sends DNS queries outside the internal network.
docker run -d --name "$dns_name" --network "$internal_network" \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=8m \
  --user 10003:10003 --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges:true \
  --pids-limit 16 --memory 64m --cpus 0.25 \
  --entrypoint python "$dns_image" /app/dns_sinkhole.py >/dev/null

dns_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"${internal_network}\").IPAddress}}" "$dns_name")

# Only this tiny, fixed-destination relay receives the LiteLLM credential.
docker run -d --name "$relay_name" --network "$egress_network" \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --user 10002:10002 --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 32 --memory 256m --cpus 0.5 \
  --env QA_EXPLORER_LITELLM_API_KEY --env QA_EXPLORER_MODEL \
  "$relay_image" >/dev/null
docker network connect --alias litellm-relay "$internal_network" "$relay_name"

# Fixtures have no published ports, no secrets, no external network and read-only filesystems.
docker run -d --name "$dashboard_name" --network "$internal_network" --network-alias dashboard \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 32 --memory 256m --cpus 0.5 \
  --env HOST=0.0.0.0 --env PORT=18080 \
  --mount "type=bind,src=${workspace},dst=/workspace,readonly" \
  --workdir /workspace node:22-bookworm-slim node bin/server.js >/dev/null

docker run -d --name "$mock_name" --network "$internal_network" --network-alias mock-proxy \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=16m \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 32 --memory 128m --cpus 0.5 \
  --entrypoint python "$agent_image" /app/mock_proxy.py >/dev/null

# Pin approved service IPs and route every external DNS question to the NXDOMAIN sinkhole.
relay_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"${internal_network}\").IPAddress}}" "$relay_name")
dashboard_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"${internal_network}\").IPAddress}}" "$dashboard_name")
mock_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"${internal_network}\").IPAddress}}" "$mock_name")

# The agent has no secret, no repository mount, no Docker socket, no external DNS, and no direct egress route.
docker run -d --name "$agent_name" --network "$internal_network" \
  --read-only --tmpfs /tmp:rw,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700 \
  --tmpfs /home/qa:rw,nosuid,nodev,size=512m,uid=10001,gid=10001,mode=0700 \
  --dns "$dns_ip" \
  --add-host "dashboard:${dashboard_ip}" \
  --add-host "mock-proxy:${mock_ip}" \
  --add-host "litellm-relay:${relay_ip}" \
  --add-host "qa-dns:${dns_ip}" \
  --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 2g --cpus 2 --shm-size 256m \
  --env HOME=/home/qa --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  --env LITELLM_API_BASE=http://litellm-relay:8080/v1 \
  --env QA_EXPLORER_MODEL --env BROWSER_USE_SETUP_LOGGING=false --env ANONYMIZED_TELEMETRY=false \
  --entrypoint python "$agent_image" -c 'import time; time.sleep(900)' >/dev/null

docker cp "$context_file" "$agent_name:/tmp/qa-context.json" >/dev/null

ready=false
for _ in $(seq 1 40); do
  if docker exec "$agent_name" python -c 'import urllib.request; [urllib.request.urlopen(url, timeout=2).read() for url in ("http://dashboard:18080/", "http://mock-proxy:18081/1/summary", "http://litellm-relay:8080/healthz")]' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.25
done
if [ "$ready" != true ]; then
  echo "Isolated QA network did not become ready. Container output is intentionally not exposed."
  exit 1
fi
# Verify the agent process is non-root, has no capabilities/secrets/host mounts,
# and can write only to the explicitly provided temporary filesystem.
docker exec "$agent_name" python -c 'import os,pathlib; status=dict(line.split(":",1) for line in pathlib.Path("/proc/self/status").read_text().splitlines() if ":" in line); assert os.geteuid()==10001; assert int(status.get("CapEff","0").strip(),16)==0; assert status.get("NoNewPrivs","").strip()=="1"; assert "QA_EXPLORER_LITELLM_API_KEY" not in os.environ; assert not pathlib.Path("/workspace").exists(); assert not pathlib.Path("/var/run/docker.sock").exists(); pathlib.Path("/tmp/sandbox-write-probe").write_text("ok"); pathlib.Path("/tmp/sandbox-write-probe").unlink();
try:
 pathlib.Path("/app/sandbox-write-probe").write_text("should fail")
except OSError:
 pass
else:
 raise SystemExit("Browser Use root filesystem is unexpectedly writable")'
# Verify the DNS sinkhole itself answers NXDOMAIN, then verify Docker's resolver
# routes external names to that sinkhole rather than to an upstream DNS provider.
docker exec "$agent_name" python -c 'import socket,sys,struct; q=b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07example\x03com\x00\x00\x01\x00\x01"; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.settimeout(2); s.sendto(q,(sys.argv[1],53)); r,_=s.recvfrom(512); assert len(r)>=12 and (r[3]&15)==3, "DNS sinkhole did not return NXDOMAIN"' "$dns_ip"
# Verify that even a direct-IP HTTPS connection cannot leave the internal network.
docker exec "$agent_name" python -c 'import socket; s=socket.socket(); s.settimeout(2);
try:
 s.connect(("1.1.1.1",443))
except OSError:
 pass
else:
 raise SystemExit("Browser Use sandbox unexpectedly has direct egress")
finally:
 s.close()'
docker exec "$agent_name" python -c 'import socket;
try:
 socket.getaddrinfo("example.com",443)
except socket.gaierror:
 pass
else:
 raise SystemExit("Browser Use sandbox unexpectedly has external DNS")'
docker exec "$agent_name" python -c 'import socket,sys;
try:
 socket.create_connection((sys.argv[1],int(sys.argv[2])),timeout=2)
except OSError:
 pass
else:
 raise SystemExit("Browser Use sandbox unexpectedly reached the runner host")' "$host_gateway_ip" "$host_test_port"

if [ "${QA_SANDBOX_SMOKE_ONLY:-false}" = true ]; then
  # Exercise the bundled Chromium and local dashboard without making any model call.
  docker exec "$agent_name" python -c 'import asyncio; from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch()
  page=await browser.new_page()
  await page.goto("http://dashboard:18080", wait_until="domcontentloaded")
  assert await page.title()
  await browser.close()
asyncio.run(main())'
  docker exec "$agent_name" python -c 'import browser_use; from run_explorer import validate_relay_url; assert validate_relay_url("http://litellm-relay:8080/v1"); print("Browser Use and Chromium imports passed")'
  echo "Sandbox isolation smoke passed; no model call was made."
  exit 0
fi

mkdir -p "$(dirname "$report_file")"
docker exec "$agent_name" python /app/run_explorer.py \
  --context /tmp/qa-context.json --output /tmp/ai-browser-qa.json
docker cp "$agent_name:/tmp/ai-browser-qa.json" "$report_file" >/dev/null
