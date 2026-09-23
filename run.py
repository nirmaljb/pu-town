#!/usr/bin/env python3
"""Run the PU Town backend and frontend together.

    python run.py              # start both, open the browser
    python run.py --no-browser # start both without opening a browser

Press Ctrl+C to stop both servers.
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WINDOWS = os.name == "nt"

BACKEND_PORT = 8080
FRONTEND_PORT = 5173
HEALTH_URL = f"http://localhost:{BACKEND_PORT}/health"
CLIENT_URL = f"http://localhost:{FRONTEND_PORT}/"


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start(name: str, command: list[str], cwd: Path) -> subprocess.Popen:
    """Start a process in its own group and echo its output with a prefix."""
    kwargs = {}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = subprocess.Popen(
        command,
        cwd=cwd,
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

    threading.Thread(target=pump, daemon=True).start()
    return process


def stop(process: subprocess.Popen) -> None:
    """Stop a process and every child it started (Maven forks the JVM)."""
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the PU Town backend and frontend.")
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    args = parser.parse_args()

    # The backend only accepts browser origins from port 5173, so Vite must not
    # silently fall back to another port.
    for port, what in ((BACKEND_PORT, "backend"), (FRONTEND_PORT, "frontend")):
        if port_in_use(port):
            print(f"Port {port} ({what}) is already in use. Stop whatever is using it and try again.")
            return 1

    if not (FRONTEND / "node_modules").is_dir():
        print("Installing frontend dependencies (npm ci)...")
        if subprocess.run(["npm", "ci"], cwd=FRONTEND, shell=IS_WINDOWS).returncode != 0:
            print("npm ci failed.")
            return 1

    mvnw = str(BACKEND / ("mvnw.cmd" if IS_WINDOWS else "mvnw"))
    processes: list[subprocess.Popen] = []
    try:
        print("Starting backend on port 8080 (first run may take a while)...")
        backend = start("backend", [mvnw, "spring-boot:run"], BACKEND)
        processes.append(backend)
        if not wait_for_backend(backend):
            print("Backend did not become healthy.")
            return 1
        print(f"Backend is healthy: {HEALTH_URL}")

        print("Starting frontend on port 5173...")
        frontend = start("frontend", ["npm", "run", "dev", "--", "--port", str(FRONTEND_PORT), "--strictPort"], FRONTEND)
        processes.append(frontend)

        while not port_in_use(FRONTEND_PORT):
            if frontend.poll() is not None:
                print("Frontend exited before it started.")
                return 1
            time.sleep(0.5)

        print(f"\nPU Town is running: {CLIENT_URL}")
        print("A Game needs at least 4 Players; open several tabs to try it alone.")
        print("Press Ctrl+C to stop.\n")
        if not args.no_browser:
            webbrowser.open(CLIENT_URL)

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
