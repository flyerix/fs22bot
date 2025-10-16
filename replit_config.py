"""
Configurazione ottimizzata per Replit Free
"""
import os
from flask import Flask
from threading import Thread

# Configurazione per Replit
class ReplitConfig:
    def __init__(self):
        self.keep_alive = True
        self.port = 8080
        
    def setup_keep_alive(self):
        """Setup per mantenere attivo Replit"""
        if os.environ.get('REPL_ID') and self.keep_alive:
            app = Flask('')
            
            @app.route('/')
            def home():
                return "🤖 FS22 Bot è online!"
            
            @app.route('/health')
            def health():
                return 'OK'
            
            def run():
                app.run(host='0.0.0.0', port=self.port)
            
            thread = Thread(target=run)
            thread.daemon = True
            thread.start()
            print("✅ Keep-alive server avviato per Replit")

# Istanza globale
replit_config = ReplitConfig()
