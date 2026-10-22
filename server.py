import http.server
import socketserver
import ssl
import sys
import os

PORT = 8090
HOST = "0.0.0.0"

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        client_ip = self.client_address[0]
        msg = f"[{client_ip}] {format % args}"
        sys.stdout.buffer.write((msg + "\n").encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()

import socket

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "10.189.121.253"

def run_server(use_ssl=True):
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    
    has_certs = os.path.exists("cert.pem") and os.path.exists("key.pem")
    ssl_active = use_ssl and has_certs
    protocol = "https" if ssl_active else "http"
    
    with http.server.ThreadingHTTPServer((HOST, PORT), CORSRequestHandler) as httpd:
        if ssl_active:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
            httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
            
        local_ip = get_local_ip()
        print("=" * 60, flush=True)
        print("[VOLT-X] Staff Scanner Server Active", flush=True)
        print(f"Local:    {protocol}://localhost:{PORT}", flush=True)
        print(f"Network:  {protocol}://{local_ip}:{PORT}", flush=True)
        print("CORS:     Enabled (All Origins)", flush=True)
        print(f"SSL:      {'Enabled (HTTPS) - Camera stream supported' if ssl_active else 'Disabled (HTTP)'}", flush=True)
        print("=" * 60, flush=True)
        print(f"Open in browser: {protocol}://{local_ip}:{PORT}\n", flush=True)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.", flush=True)

if __name__ == "__main__":
    # Enable SSL by default if certificates exist (required for mobile camera & HTTPS browsers)
    disable_ssl = "--no-ssl" in sys.argv or "--http" in sys.argv
    run_server(use_ssl=not disable_ssl)
