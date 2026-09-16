"""Loopback-only developer editor. Start with npm run avatars in frontend/."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from authoring import Authoring, ROOT

editor = Authoring()

class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type='application/json'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def local_request(self):
        host = self.headers.get('Host')
        origin = self.headers.get('Origin')
        return host in ('127.0.0.1:5174', 'localhost:5174') and (origin is None or origin in ('http://127.0.0.1:5174', 'http://localhost:5174'))

    def do_GET(self):
        if not self.local_request():
            return self.respond(403, {'error': 'Open the editor on localhost:5174.'})
        if self.path == '/api/library':
            return self.respond(200, {'drafts': editor.library(), 'catalogue': editor.catalogue,
                'published': json.loads(editor.publication.read_text()) if editor.publication.exists() else {'presets': []}})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/editor.js': ('editor.js', 'text/javascript'), '/editor.css': ('editor.css', 'text/css')}
        if self.path in files:
            filename, content_type = files[self.path]
            return self.respond(200, (ROOT / filename).read_bytes(), content_type)
        self.respond(404, {'error': 'Not found'})

    def do_POST(self):
        if not self.local_request() or self.headers.get('Content-Type') != 'application/json':
            return self.respond(403, {'error': 'Use the local editor with JSON requests.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536:
                raise ValueError('The design request must be between 1 and 65536 bytes.')
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('Expected a design request object.')
            if self.path == '/api/save':
                result = editor.save(data)
            elif self.path == '/api/duplicate':
                result = editor.duplicate(data['id'])
            elif self.path == '/api/delete':
                editor.delete(data['id'])
                result = {'deleted': data['id']}
            elif self.path == '/api/preview':
                result = editor.preview(data)
            elif self.path == '/api/publish':
                result = editor.publish(data['ids'])
            else:
                return self.respond(404, {'error': 'Not found'})
            self.respond(200, result)
        except (ValueError, TypeError) as error:
            self.respond(400, {'error': str(error)})
        except KeyError as error:
            self.respond(400, {'error': f'The request is missing {error}.'})
        except OSError:
            # Never echo filesystem paths back into the editor; they are not actionable.
            self.respond(400, {'error': 'The draft library could not be read. Check the editor console.'})

if __name__ == '__main__':
    print('Avatar workshop: http://localhost:5174 (Ctrl+C to stop)', flush=True)
    HTTPServer(('127.0.0.1', 5174), Handler).serve_forever()
