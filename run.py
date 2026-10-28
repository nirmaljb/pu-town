#!/usr/bin/env python3
"""Start PU Town with one command.

    python run.py              # play on this computer and on your home network
    python run.py --share      # also make a public link anyone on the internet can open
    python run.py --no-browser # don't open a browser window on this computer

What it starts:

    backend   Java Spring Boot server on port 8080. It owns the Game: Rooms, Roles,
              the clock, every position. Players never talk to it directly...
    frontend  ...because the Vite server on port 5173 serves the page AND passes the
              game connection (/ws/game) through to the backend. One port carries
              everything, which is what makes a single shared link possible.
    tunnel    (--share only) Cloudflare's free quick tunnel. It gives this computer a
              temporary https://<random>.trycloudflare.com address that forwards to
              port 5173. No account is needed; the link changes every time.

Press Ctrl+C to stop everything.
"""

import argparse
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

# ----- where things are -------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WINDOWS = os.name == "nt"

BACKEND_PORT = 8080
FRONTEND_PORT = 5173
HEALTH_URL = f"http://localhost:{BACKEND_PORT}/health"
CLIENT_URL = f"http://localhost:{FRONTEND_PORT}/"

# The quick tunnel prints its public address in a line like
# "|  https://quiet-town-example.trycloudflare.com  |".
TUNNEL_LINK = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


# ----- finding the tools ------------------------------------------------------------------

def find_java_home() -> str | None:
    """A JDK 17+ folder, so the backend starts even when Java isn't on PATH yet.

    A freshly installed JDK is only on PATH in terminals opened after the install,
    so also look in the usual install folders.
    """
    if os.environ.get("JAVA_HOME"):
        return os.environ["JAVA_HOME"]
    if shutil.which("java"):
        return None  # java on PATH is enough; the Maven Wrapper finds it.
    roots = [Path("C:/Program Files/Eclipse Adoptium"), Path("C:/Program Files/Java"),
             Path("C:/Program Files/Microsoft")] if IS_WINDOWS else [Path("/usr/lib/jvm")]
    for root in roots:
        if root.is_dir():
            for jdk in sorted(root.glob("jdk*"), reverse=True):
                if (jdk / "bin" / ("java.exe" if IS_WINDOWS else "java")).exists():
                    return str(jdk)
    return None


def find_cloudflared() -> str | None:
    """The Cloudflare tunnel program, on PATH or where its Windows installer puts it."""
    found = shutil.which("cloudflared")
    if found:
        return found
    for folder in ("C:/Program Files (x86)/cloudflared", "C:/Program Files/cloudflared"):
        candidate = Path(folder) / "cloudflared.exe"
        if candidate.exists():
            return str(candidate)
    return None


# ----- network helpers --------------------------------------------------------------------

def lan_addresses() -> list[str]:
    """The IPv4 addresses other computers on the same network can reach this one at."""
    addresses: set[str] = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    # Ask the OS which interface it would use to reach the internet. UDP "connect"
    # sends no packet; it only picks a route, so this works offline too.
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("8.8.8.8", 80))
            addresses.add(s.getsockname()[0])
        except OSError:
            pass
    return sorted(a for a in addresses if not a.startswith("127.") and not a.startswith("169.254."))


def port_in_use(port: int) -> bool:
    """Whether something on this computer is already listening on `port`."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


# ----- running child processes ------------------------------------------------------------

def start(name: str, command: list[str], cwd: Path, env=None, on_line=None) -> subprocess.Popen:
    """Start a process in its own group and echo its output with a [name] prefix.

    `on_line`, when given, is also called with every line the process prints.
    """
    kwargs = {}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=IS_WINDOWS,  # needed to resolve mvnw.cmd and npm.cmd
        **kwargs,
    )

    def pump() -> None:
        for line in process.stdout:
            print(f"[{name}] {line}", end="", flush=True)
            if on_line:
                on_line(line)

    threading.Thread(target=pump, daemon=True).start()
    return process


def stop(process: subprocess.Popen) -> None:
    """Stop a process and every child it started (Maven forks the JVM, npm forks Node)."""
    if process.poll() is not None:
        return
    if IS_WINDOWS:
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def wait_for_backend(process: subprocess.Popen, timeout: float = 180) -> bool:
    """Poll GET /health until the backend answers 200, or give up."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=2) as response:
                if response.status == 200:
                    return True
        except OSError:
            pass
        time.sleep(1)
    return False


def wait_for_port(process: subprocess.Popen, port: int) -> bool:
    """Wait until `process` is listening on `port`; False if it exits first."""
    while not port_in_use(port):
        if process.poll() is not None:
            return False
        time.sleep(0.5)
    return True


# ----- the main program -------------------------------------------------------------------

def main() -> int:
    # Vite prints symbols (such as an arrow) that a non-UTF-8 console cannot show. Replace
    # them rather than let the echo thread crash, which would stop draining Vite's output.
    sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Run PU Town.")
    parser.add_argument("--share", action="store_true",
                        help="also create a public link that players on other networks can open")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    args = parser.parse_args()

    # 1. Check that nothing else (an older copy of the game?) already holds our ports.
    #    The backend only accepts pages from port 5173, so Vite must not pick another one.
    for port, what in ((BACKEND_PORT, "backend"), (FRONTEND_PORT, "frontend")):
        if port_in_use(port):
            print(f"Port {port} ({what}) is already in use. Stop whatever is using it and try again.")
            return 1

    cloudflared = find_cloudflared() if args.share else None
    if args.share and not cloudflared:
        print("--share needs Cloudflare's tunnel program, cloudflared. Install it with:")
        print("    winget install --id Cloudflare.cloudflared" if IS_WINDOWS
              else "    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        return 1

    # 2. Install the frontend's packages the first time.
    if not (FRONTEND / "node_modules").is_dir():
        print("Installing frontend dependencies (npm ci)...")
        if subprocess.run(["npm", "ci"], cwd=FRONTEND, shell=IS_WINDOWS).returncode != 0:
            print("npm ci failed.")
            return 1

    # 3. A shared link serves the optimised build: one small file instead of hundreds of
    #    modules, which matters for Players far away.
    if args.share:
        print("Building the game for sharing...")
        if subprocess.run(["npm", "run", "build"], cwd=FRONTEND, shell=IS_WINDOWS).returncode != 0:
            print("The frontend build failed.")
            return 1

    backend_env = os.environ.copy()
    java_home = find_java_home()
    if java_home:
        backend_env["JAVA_HOME"] = java_home

    mvnw = str(BACKEND / ("mvnw.cmd" if IS_WINDOWS else "mvnw"))
    processes: list[subprocess.Popen] = []
    try:
        # 4. The backend: the server that owns the Game.
        print(f"Starting backend on port {BACKEND_PORT} (first run may take a while)...")
        backend = start("backend", [mvnw, "spring-boot:run"], BACKEND, env=backend_env)
        processes.append(backend)
        if not wait_for_backend(backend):
            print("Backend did not become healthy. Is JDK 17 installed?")
            return 1
        print(f"Backend is healthy: {HEALTH_URL}")

        # 5. The frontend: serves the page on every network interface (0.0.0.0) and
        #    forwards the game connection to the backend (see frontend/vite.config.ts).
        mode = "preview" if args.share else "dev"
        print(f"Starting frontend on port {FRONTEND_PORT}...")
        frontend = start("frontend", ["npx", "vite", mode, "--host", "0.0.0.0"], FRONTEND)
        processes.append(frontend)
        if not wait_for_port(frontend, FRONTEND_PORT):
            print("Frontend exited before it started.")
            return 1

        # 6. Optionally, the public link.
        public_link: list[str] = []
        if args.share:
            print("Opening a public link with Cloudflare...")
            found = threading.Event()

            def spot_link(line: str) -> None:
                match = TUNNEL_LINK.search(line)
                if match and not found.is_set():
                    public_link.append(match.group(0))
                    found.set()

            tunnel = start("tunnel", [cloudflared, "tunnel", "--no-autoupdate",
                                      "--url", f"http://localhost:{FRONTEND_PORT}"], ROOT, on_line=spot_link)
            processes.append(tunnel)
            if not found.wait(60):
                print("Cloudflare did not hand out a link. Check your internet connection and try again.")
                return 1

        # 7. Tell the Host which address to give to whom.
        print("\n" + "=" * 64)
        print(f"  PU Town is running.\n")
        print(f"  This computer:      {CLIENT_URL}")
        for address in lan_addresses():
            print(f"  Same Wi-Fi/router:  http://{address}:{FRONTEND_PORT}/")
        if public_link:
            print(f"\n  SHARE THIS LINK:    {public_link[0]}")
            print("  (anyone on the internet can open it; it stops working when you press Ctrl+C)")
        print("\n  A Game needs 4 to 10 Players. One creates a Room, the rest join with its code.")
        print("  Press Ctrl+C to stop.")
        print("=" * 64 + "\n")
        if not args.no_browser:
            webbrowser.open(CLIENT_URL)

        # 8. Keep running until Ctrl+C, or until one of the servers dies.
        while all(p.poll() is None for p in processes):
            time.sleep(1)
        print("A server stopped unexpectedly; shutting down.")
        return 1
    except KeyboardInterrupt:
        print("\nStopping...")
        return 0
    finally:
        for process in reversed(processes):
            stop(process)
        print("Stopped.")


if __name__ == "__main__":
    sys.exit(main())
