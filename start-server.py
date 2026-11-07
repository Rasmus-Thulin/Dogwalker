#!/usr/bin/env python3
"""
Enkel lokal webbserver för Tesla Dashboard
Kör: python3 start-server.py
"""
import http.server
import socketserver
import os

PORT = 8000

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
    print(f"🚗 Tesla Dashboard körs på http://localhost:{PORT}")
    print(f"   Öppna http://localhost:{PORT} i din webbläsare")
    print(f"   Tryck Ctrl+C för att stoppa servern")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n✋ Servern stoppades")
