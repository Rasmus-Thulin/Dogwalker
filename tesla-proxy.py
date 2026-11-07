#!/usr/bin/env python3
"""
Tesla API Proxy Server
Kör: python3 tesla-proxy.py
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.request
import urllib.error
import ssl
import warnings

PORT = 8001
TESLA_API_BASE = 'https://owner-api.teslamotors.com/api/1'

# Inaktivera SSL-certifikatverifiering (för lokal utveckling)
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

# Tysta ned SSL-varningar
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        self.proxy_request('GET')

    def do_POST(self):
        self.proxy_request('POST')

    def proxy_request(self, method):
        try:
            # Ta bort /api från början av path
            tesla_path = self.path.replace('/api', '', 1)
            tesla_url = f'{TESLA_API_BASE}{tesla_path}'
            
            # Hämta Authorization header
            auth_header = self.headers.get('Authorization')
            
            print(f'{method} {tesla_url}')
            print(f'Authorization: {auth_header[:50] if auth_header else "INGEN"}...')
            
            # Skapa request till Tesla API
            headers = {
                'Authorization': auth_header,
                'Content-Type': 'application/json',
                'User-Agent': 'Tesla-Dashboard/1.0'
            }
            
            req = urllib.request.Request(tesla_url, headers=headers, method=method)
            
            # Skicka request
            with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
                data = response.read()
                
                # Skicka svar tillbaka
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(data)
                
        except urllib.error.HTTPError as e:
            print(f'HTTP Error: {e.code} - {e.reason}')
            self.send_response(e.code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_data = json.dumps({'error': str(e.reason), 'code': e.code})
            self.wfile.write(error_data.encode())
            
        except Exception as e:
            print(f'Error: {str(e)}')
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_data = json.dumps({'error': str(e)})
            self.wfile.write(error_data.encode())

    def log_message(self, format, *args):
        # Tysta ner standard logging
        return

print(f'🔌 Tesla API Proxy körs på http://localhost:{PORT}')
print(f'   Proxy vidarebefordrar till: {TESLA_API_BASE}')
print(f'   Tryck Ctrl+C för att stoppa')

httpd = HTTPServer(('', PORT), ProxyHandler)

try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print('\n\n✋ Proxy stoppades')
