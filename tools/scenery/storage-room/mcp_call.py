"""Call the official Blender MCP server over MCP stdio; retain its response.

Run with the Python environment containing mcp-for-blender and mcp.
Usage: python mcp_call.py REQUEST.json RESULT.json /path/to/mcp-for-blender [port]
Image results (viewport screenshots) are written beside RESULT.json.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
import sys
import time
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    request_path, result_path, server = sys.argv[1:4]
    port = sys.argv[4] if len(sys.argv) > 4 else '9878'
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
            if not request.get('list'):
                for i, item in enumerate(result.content):
                    if item.type == 'image':
                        image = Path(result_path).with_suffix(f'.{i}.png')
                        image.write_bytes(base64.b64decode(item.data))
                        print('IMAGE '+str(image))
                        item.data = '<written to %s>' % image.name
                output['result'] = result.model_dump(mode='json')
            Path(result_path).write_text(json.dumps(output, indent=2)+'\n')
            if request.get('list'):
                print('\n'.join(t.name for t in result.tools))
            else:
                for item in result.content:
                    if item.type == 'text':
                        print(item.text)
            if getattr(result, 'isError', False):
                raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
