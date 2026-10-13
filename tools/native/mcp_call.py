#!/usr/bin/env python3
"""Invoke an installed local MCP bridge using a JSON request file.

This development-only helper records elapsed wall time and unmodified results.
No bridge or command execution is included in the Player build.
"""
import argparse
import asyncio
import json
import os
import time
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def call(request, command, args):
    env = dict(os.environ, BLENDER_MCP_DISABLE_TELEMETRY="1", DISABLE_TELEMETRY="1")
    async with stdio_client(StdioServerParameters(command=command, args=args, env=env)) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            started = time.monotonic()
            result = (await session.list_tools() if request.get("list")
                      else await session.call_tool(request["tool"], request.get("arguments", {})))
            return {"elapsedSeconds": round(time.monotonic() - started, 3),
                    "result": result.model_dump(mode="json")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("request", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("command")
    parser.add_argument("args", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    result = asyncio.run(call(json.loads(options.request.read_text()), options.command, options.args))
    rendered = json.dumps(result, indent=2)
    if options.output:
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(rendered + "\n")
    else:
        print(rendered)


if __name__ == "__main__":
    main()
