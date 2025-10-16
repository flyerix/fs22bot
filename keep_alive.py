from flask import Flask
from threading import Thread
import time

app = Flask('')

@app.route('/')
def home():
    return "✅ FS22 Discord Bot è online e funzionante!"

@app.route('/health')
def health():
    return 'OK', 200

@app.route('/ping')
def ping():
    return 'Pong!', 200

def run():
    app.run(host='0.0.0.0', port=8080)

def keep_alive():
    server = Thread(target=run)
    server.daemon = True
    server.start()
    print("🔄 Keep-alive server avviato su porta 8080")
