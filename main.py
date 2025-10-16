import discord
from discord.ext import tasks, commands
import aiohttp
import asyncio
import json
import os
from datetime import datetime, timedelta
import xml.etree.ElementTree as ET

# ==================== CONFIGURAZIONE ====================
def load_config():
    """Carica configurazione da environment variables"""
    config = {
        "server_url": os.environ.get('FS22_SERVER_URL', 'http://89.163.192.12:10100/feed/dedicated-server-stats.xml?code=d735be47f00add366dc6d110a0eb5dac'),
        "channel_id": os.environ.get('DISCORD_CHANNEL_ID', '1428263766923153510'),
        "check_interval": int(os.environ.get('CHECK_INTERVAL', '60'))
    }
    return config

CONFIG = load_config()

# Inizializzazione bot
intents = discord.Intents.default()
intents.message_content = True
intents.members = True

bot = commands.Bot(command_prefix='!', intents=intents, help_command=None)

# Storage dati
server_data = {
    "last_status": None,
    "last_players": 0,
    "last_mods": [],
    "last_check": None
}

# Emoji per il bot
EMOJIS = {
    "online": "🟢",
    "offline": "🔴",
    "players": "👥",
    "mods": "📦",
    "warning": "⚠️",
    "success": "✅",
    "error": "❌",
    "info": "ℹ️",
    "clock": "⏰",
    "server": "🖥️",
    "chart": "📊",
    "farm": "🚜",
    "map": "🗺️",
    "time": "⏱️"
}

# ==================== FUNZIONI SERVER FS22 ====================
async def fetch_server_xml():
    """Recupera i dati XML dal server FS22"""
    try:
        url = f"{CONFIG['server_url']}"
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    return None
    except Exception as e:
        print(f"Errore nel fetch XML: {e}")
        return None

def parse_server_data(xml_content):
    """Analizza i dati XML del server FS22 - ADATTATO AL TUO XML"""
    if not xml_content:
        return None
    
    try:
        root = ET.fromstring(xml_content)
        
        # Estrai attributi principali dal tag Server
        server_attrib = root.attrib
        server_name = server_attrib.get('name', 'Server FS22')
        map_name = server_attrib.get('mapName', 'Sconosciuta')
        version = server_attrib.get('version', 'Sconosciuta')
        game = server_attrib.get('game', 'Farming Simulator 22')
        
        # Converti dayTime in ore e minuti leggibili
        day_time = server_attrib.get('dayTime', '0')
        try:
            day_time_int = int(day_time)
            hours = day_time_int // 3600000
            minutes = (day_time_int % 3600000) // 60000
            formatted_time = f"{hours:02d}:{minutes:02d}"
        except:
            formatted_time = "Sconosciuto"
        
        # Trova l'elemento Slots
        slots = root.find('Slots')
        if slots is None:
            return None
        
        # Capacità massima giocatori
        max_players = int(slots.get('capacity', 4))
        
        # Conta giocatori connessi e raccogli informazioni giocatori
        players_connected = 0
        players_info = []
        mods_list = []
        
        for child in slots:
            if child.tag == 'Player':
                is_used = child.get('isUsed', 'false')
                if is_used == 'true':
                    players_connected += 1
                    player_name = child.text if child.text else "Sconosciuto"
                    is_admin = child.get('isAdmin', 'false')
                    uptime = child.get('uptime', '0')
                    players_info.append({
                        'name': player_name,
                        'admin': is_admin == 'true',
                        'uptime': uptime
                    })
            elif child.tag == 'Mod':
                mod_name = child.get('name', 'Mod Sconosciuta')
                mod_author = child.get('author', 'Autore Sconosciuto')
                mod_version = child.get('version', '1.0.0.0')
                mod_display = f"{mod_name} v{mod_version} by {mod_author}"
                mods_list.append(mod_display)
        
        server_info = {
            "status": "Online",
            "name": server_name,
            "players": players_connected,
            "max_players": max_players,
            "map": map_name,
            "version": version,
            "game": game,
            "day_time": formatted_time,
            "mods": mods_list,
            "mods_count": len(mods_list),
            "players_info": players_info
        }
        
        return server_info
        
    except Exception as e:
        print(f"Errore nel parsing XML: {e}")
        return None

# ==================== FUNZIONI UTILITY ====================
def save_data():
    """Salva i dati su file (non usato su Render ma mantenuto per compatibilità)"""
    try:
        with open('server_data.json', 'w') as f:
            json.dump(server_data, f)
    except Exception as e:
        print(f"Errore nel salvataggio dati: {e}")

def load_data():
    """Carica i dati dal file (non usato su Render ma mantenuto per compatibilità)"""
    global server_data
    try:
        with open('server_data.json', 'r') as f:
            server_data.update(json.load(f))
    except FileNotFoundError:
        print("File dati non trovato, uso dati di default")

def create_status_embed(server_info, changed=False):
    """Crea un embed grazioso per lo status"""
    
    if server_info is None:
        embed = discord.Embed(
            title=f"{EMOJIS['offline']} Server Offline",
            description="Il server non risponde o non è raggiungibile.",
            color=0xff0000,
            timestamp=datetime.now()
        )
        embed.set_footer(text="FS22 Monitor • Server Offline")
        return embed
    
    # Determina colore e emoji in base allo stato
    status_emoji = EMOJIS['online'] if server_info['status'] == 'Online' else EMOJIS['offline']
    color = 0x00ff00 if server_info['status'] == 'Online' else 0xff0000
    
    embed = discord.Embed(
        title=f"{status_emoji} {server_info['name']}",
        description=f"**Stato:** `{server_info['status']}`\n"
                   f"**Gioco:** `{server_info['game']}`\n"
                   f"**Mappa:** `{server_info['map']}`\n"
                   f"**Versione:** `{server_info['version']}`\n"
                   f"**Ora nel gioco:** `{server_info['day_time']}` {EMOJIS['time']}",
        color=color,
        timestamp=datetime.now()
    )
    
    # Field giocatori
    players_text = f"{server_info['players']}/{server_info['max_players']}"
    embed.add_field(
        name=f"{EMOJIS['players']} Giocatori Connessi",
        value=f"`{players_text}`",
        inline=True
    )
    
    # Field mods
    embed.add_field(
        name=f"{EMOJIS['mods']} Mod Attive",
        value=f"`{server_info['mods_count']}` mod installate",
        inline=True
    )
    
    # Dettagli giocatori se presenti
    if server_info['players'] > 0:
        players_list = []
        for player in server_info['players_info']:
            admin_badge = " 👑" if player['admin'] else ""
            players_list.append(f"• {player['name']}{admin_badge}")
        
        players_display = "\n".join(players_list[:5])
        if len(players_list) > 5:
            players_display += f"\n• ... e altri {len(players_list) - 5} giocatori"
        
        embed.add_field(
            name=f"{EMOJIS['players']} Giocatori Online",
            value=players_display,
            inline=False
        )
    
    # Field cambiamenti se rilevati
    if changed:
        embed.add_field(
            name=f"{EMOJIS['warning']} Stato Cambiato",
            value="Lo stato del server è cambiato dall'ultimo controllo!",
            inline=False
        )
    
    embed.set_footer(text="FS22 Monitor • Tempo reale")
    
    return embed

def create_mod_changelog_embed(new_mods, removed_mods, total_mods):
    """Crea un embed per il changelog delle mod"""
    
    embed = discord.Embed(
        title=f"{EMOJIS['mods']} Changelog Mod - Ultime 24h",
        description="Elenco delle modifiche alle mod del server",
        color=0xffa500,
        timestamp=datetime.now()
    )
    
    if new_mods:
        embed.add_field(
            name=f"{EMOJIS['success']} Mod Aggiunte ({len(new_mods)})",
            value="\n".join([f"• `{mod}`" for mod in new_mods]),
            inline=False
        )
    
    if removed_mods:
        embed.add_field(
            name=f"{EMOJIS['error']} Mod Rimosse ({len(removed_mods)})",
            value="\n".join([f"• `{mod}`" for mod in removed_mods]),
            inline=False
        )
    
    if not new_mods and not removed_mods:
        embed.add_field(
            name=f"{EMOJIS['info']} Nessun Cambiamento",
            value="Nessuna mod è stata aggiunta o rimossa nelle ultime 24 ore.",
            inline=False
        )
    
    embed.add_field(
        name=f"{EMOJIS['chart']} Riepilogo Totale",
        value=f"**Mod attive attualmente:** `{total_mods}`",
        inline=False
    )
    
    embed.set_footer(text="FS22 Monitor • Changelog Giornaliero")
    
    return embed

# ==================== EVENTI BOT ====================
@bot.event
async def on_ready():
    print(f'{EMOJIS["success"]} Bot {bot.user} connesso a Discord!')
    print(f'{EMOJIS["info"]} Monitoraggio server FS22 attivo')
    print(f'{EMOJIS["server"]} Server URL: {CONFIG["server_url"]}')
    print(f'{EMOJIS["players"]} Canale notifiche: {CONFIG["channel_id"]}')
    
    # Carica dati salvati (solo per compatibilità)
    try:
        load_data()
    except:
        print("Inizializzazione dati da zero")
    
    # Avvia task
    if not server_monitor.is_running():
        server_monitor.start()
    
    if not daily_mod_check.is_running():
        daily_mod_check.start()
    
    # Imposta stato del bot
    activity = discord.Activity(type=discord.ActivityType.watching, name="Server FS22")
    await bot.change_presence(activity=activity)

# ==================== COMANDI BOT ====================
@bot.slash_command(name="status", description="📊 Controlla lo stato attuale del server FS22")
async def status(ctx):
    """Comando per controllare lo stato del server"""
    
    embed = discord.Embed(
        title=f"{EMOJIS['clock']} Controllo Stato...",
        description="Sto recuperando i dati dal server...",
        color=0xffff00
    )
    await ctx.respond(embed=embed)
    
    # Fetch dati server
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    # Invia embed aggiornato
    embed = create_status_embed(server_info)
    await ctx.edit(embed=embed)

@bot.slash_command(name="players", description="👥 Mostra i giocatori attualmente connessi")
async def players(ctx):
    """Comando per vedere i giocatori online"""
    
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    if server_info is None or server_info['status'] != 'Online':
        embed = discord.Embed(
            title=f"{EMOJIS['offline']} Server Offline",
            description="Impossibile recuperare la lista giocatori.",
            color=0xff0000
        )
        await ctx.respond(embed=embed)
        return
    
    embed = discord.Embed(
        title=f"{EMOJIS['players']} Giocatori Online - {server_info['name']}",
        description=f"**{server_info['players']}** giocatori connessi su **{server_info['max_players']}** massimi",
        color=0x00ff00
    )
    
    if server_info['players'] > 0:
        players_list = []
        for player in server_info['players_info']:
            admin_status = " 👑 (Admin)" if player['admin'] else ""
            uptime_min = int(player['uptime'])
            hours = uptime_min // 60
            minutes = uptime_min % 60
            uptime_formatted = f"{hours:02d}:{minutes:02d}"
            
            players_list.append(f"• **{player['name']}**{admin_status}\n  ⏱️ Uptime: {uptime_formatted}")
        
        embed.add_field(
            name="Giocatori Connessi",
            value="\n\n".join(players_list),
            inline=False
        )
    else:
        embed.add_field(
            name="Server Vuoto",
            value="Nessun giocatore connesso al momento",
            inline=False
        )
    
    embed.set_footer(text=f"Mappa: {server_info['map']} • Ora: {server_info['day_time']}")
    await ctx.respond(embed=embed)

@bot.slash_command(name="mods", description="📦 Mostra la lista completa delle mod installate")
async def mods(ctx):
    """Comando per vedere tutte le mod"""
    
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    if server_info is None:
        embed = discord.Embed(
            title=f"{EMOJIS['error']} Errore",
            description="Impossibile recuperare la lista mod.",
            color=0xff0000
        )
        await ctx.respond(embed=embed)
        return
    
    mods_list = server_info.get('mods', [])
    
    embed = discord.Embed(
        title=f"{EMOJIS['mods']} Mod del Server - {server_info['name']}",
        description=f"**{len(mods_list)}** mod attive sul server",
        color=0x0099ff
    )
    
    if mods_list:
        mods_display = "\n".join([f"• `{mod}`" for mod in mods_list[:8]])
        if len(mods_list) > 8:
            mods_display += f"\n\n*... e altre {len(mods_list) - 8} mod*"
        
        embed.add_field(
            name="Elenco Mod",
            value=mods_display,
            inline=False
        )
    else:
        embed.add_field(
            name="Nessuna Mod",
            value="Il server non ha mod installate",
            inline=False
        )
    
    embed.set_footer(text=f"Versione server: {server_info['version']}")
    await ctx.respond(embed=embed)

@bot.slash_command(name="serverinfo", description="🖥️ Mostra informazioni dettagliate del server")
async def serverinfo(ctx):
    """Comando per informazioni dettagliate del server"""
    
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    if server_info is None:
        embed = discord.Embed(
            title=f"{EMOJIS['error']} Errore",
            description="Impossibile recuperare le informazioni del server.",
            color=0xff0000
        )
        await ctx.respond(embed=embed)
        return
    
    embed = discord.Embed(
        title=f"{EMOJIS['server']} Informazioni Server - {server_info['name']}",
        color=0x7289da,
        timestamp=datetime.now()
    )
    
    embed.add_field(
        name=f"{EMOJIS['info']} Informazioni Base",
        value=f"**Gioco:** {server_info['game']}\n"
              f"**Versione:** {server_info['version']}\n"
              f"**Mappa:** {server_info['map']}\n"
              f"**Ora gioco:** {server_info['day_time']}",
        inline=False
    )
    
    embed.add_field(
        name=f"{EMOJIS['players']} Statistiche Giocatori",
        value=f"**Connessi:** {server_info['players']}/{server_info['max_players']}\n"
              f"**Mod attive:** {server_info['mods_count']}",
        inline=True
    )
    
    status_emoji = EMOJIS['online'] if server_info['status'] == 'Online' else EMOJIS['offline']
    embed.add_field(
        name=f"{EMOJIS['chart']} Stato Server",
        value=f"**Stato:** {status_emoji} {server_info['status']}\n"
              f"**Ultimo controllo:** {server_data.get('last_check', 'Mai')}",
        inline=True
    )
    
    embed.set_footer(text="FS22 Monitor • Informazioni Complete")
    await ctx.respond(embed=embed)

@bot.slash_command(name="help", description="ℹ️ Mostra tutti i comandi disponibili")
async def help_command(ctx):
    """Comando help con tutti i comandi"""
    
    embed = discord.Embed(
        title=f"{EMOJIS['info']} FS22 Monitor - Guida Comandi",
        description="Tutti i comandi disponibili per il bot di monitoraggio",
        color=0x7289da
    )
    
    commands_list = [
        ("`/status`", "📊 Controlla lo stato attuale del server"),
        ("`/players`", "👥 Mostra giocatori connessi con dettagli"),
        ("`/mods`", "📦 Lista mod installate"),
        ("`/serverinfo`", "🖥️ Informazioni dettagliate del server"),
        ("`/help`", "ℹ️ Mostra questo messaggio")
    ]
    
    for cmd, desc in commands_list:
        embed.add_field(name=cmd, value=desc, inline=False)
    
    embed.add_field(
        name="⚡ Funzionalità Automatiche",
        value=f"{EMOJIS['warning']} Notifiche stato server in tempo reale\n"
              f"{EMOJIS['clock']} Changelog mod giornaliero\n"
              f"{EMOJIS['online']} Monitoraggio 24/7 su Render",
        inline=False
    )
    
    embed.set_footer(text="Bot creato per Farming Simulator 22 • Hosted on Render")
    await ctx.respond(embed=embed)

# ==================== TASK AUTOMATICI ====================
@tasks.loop(seconds=CONFIG['check_interval'])
async def server_monitor():
    """Task per monitorare lo stato del server in tempo reale"""
    
    channel = bot.get_channel(int(CONFIG['channel_id']))
    if channel is None:
        print("Canale non trovato! Verifica DISCORD_CHANNEL_ID")
        return
    
    # Recupera dati server
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    # Aggiorna timestamp
    server_data['last_check'] = datetime.now().isoformat()
    
    # Determina stato attuale
    current_status = "Online" if server_info is not None else "Offline"
    current_players = server_info['players'] if server_info else 0
    
    # Controlla cambiamenti
    status_changed = server_data['last_status'] != current_status
    players_changed = server_data['last_players'] != current_players
    
    # Invia notifica se ci sono cambiamenti
    if status_changed or players_changed:
        embed = create_status_embed(server_info, changed=True)
        
        if status_changed:
            if current_status == "Online":
                message = f"{EMOJIS['success']} **Il server è tornato ONLINE!**"
            else:
                message = f"{EMOJIS['error']} **Il server è andato OFFLINE!**"
            
            alert_embed = discord.Embed(
                title=f"{EMOJIS['warning']} Avviso Stato Server",
                description=message,
                color=0x00ff00 if current_status == "Online" else 0xff0000,
                timestamp=datetime.now()
            )
            await channel.send(embed=alert_embed)
        
        if players_changed and server_info:
            if current_players > server_data['last_players']:
                embed.description += f"\n\n{EMOJIS['players']} **Nuovo giocatore connesso!**"
            elif current_players < server_data['last_players']:
                embed.description += f"\n\n{EMOJIS['players']} **Giocatore disconnesso!**"
        
        await channel.send(embed=embed)
    
    # Aggiorna dati precedenti
    server_data['last_status'] = current_status
    server_data['last_players'] = current_players
    if server_info:
        server_data['last_mods'] = server_info.get('mods', [])
    
    # Salva dati (solo per compatibilità)
    try:
        save_data()
    except:
        print("Impossibile salvare dati su filesystem Render")

@tasks.loop(hours=24)
async def daily_mod_check():
    """Task giornaliero per controllare cambiamenti nelle mod"""
    
    channel = bot.get_channel(int(CONFIG['channel_id']))
    if channel is None:
        return
    
    # Recupera dati attuali
    xml_data = await fetch_server_xml()
    server_info = parse_server_data(xml_data)
    
    if server_info is None:
        return
    
    current_mods = set(server_info.get('mods', []))
    previous_mods = set(server_data.get('last_mods', []))
    
    # Trova differenze
    new_mods = current_mods - previous_mods
    removed_mods = previous_mods - current_mods
    
    # Invia changelog solo se ci sono cambiamenti
    if new_mods or removed_mods:
        embed = create_mod_changelog_embed(
            list(new_mods), 
            list(removed_mods), 
            len(current_mods)
        )
        await channel.send(embed=embed)
    else:
        embed = discord.Embed(
            title=f"{EMOJIS['info']} Report Mod Giornaliero",
            description="Nessun cambiamento nelle mod nelle ultime 24 ore.",
            color=0x00ff00,
            timestamp=datetime.now()
        )
        embed.add_field(
            name=f"{EMOJIS['mods']} Mod Attive",
            value=f"**Totale:** `{len(current_mods)}` mod",
            inline=False
        )
        embed.set_footer(text="FS22 Monitor • Report Giornaliero")
        await channel.send(embed=embed)
    
    # Aggiorna lista mods
    server_data['last_mods'] = list(current_mods)
    try:
        save_data()
    except:
        print("Impossibile salvare dati mod")

# ==================== GESTIONE ERRORI ====================
@server_monitor.before_loop
async def before_server_monitor():
    await bot.wait_until_ready()

@daily_mod_check.before_loop
async def before_daily_check():
    await bot.wait_until_ready()

# ==================== AVVIO BOT ====================
if __name__ == "__main__":
    token = os.environ.get('DISCORD_TOKEN')
    if token:
        print(f"{EMOJIS['info']} Avvio bot FS22 Monitor su Render...")
        bot.run(token)
    else:
        print("ERRORE: Token Discord non trovato!")
        print("Per favore imposta la variabile d'ambiente 'DISCORD_TOKEN' su Render")
