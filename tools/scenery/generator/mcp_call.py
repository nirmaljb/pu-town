"""Call the official Blender MCP server over MCP stdio; retain its response.

Run with the Python environment containing mcp-for-blender and mcp.
Usage: python mcp_call.py REQUEST.json RESULT.json /path/to/mcp-for-blender [PORT]
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import time
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    request_path, result_path, server = sys.argv[1:4]
    port = sys.argv[4] if len(sys.argv) > 4 else '9881'
    request = json.loads(Path(request_path).read_text())
    env = dict(os.environ, BLENDER_MCP_DISABLE_TELEMETRY='1', DISABLE_TELEMETRY='1')
    params = StdioServerParameters(command=server, args=['--port', port], env=env)
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            start = time.monotonic()
            result = (await session.list_tools() if request.get('list') else
                      await session.call_tool(request['tool'], request.get('arguments', {})))
            output = {'seconds': round(time.monotonic()-start, 3),
                      'result': result.model_dump(mode='json')}
            Path(result_path).write_text(json.dumps(output, indent=2)+'\n')
            if request.get('list'):
                print(json.dumps([t.name for t in result.tools], indent=2))
            else:
                for item in result.content:
                    if item.type == 'text':
                        print(item.text)
            if getattr(result, 'isError', False):
                raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
