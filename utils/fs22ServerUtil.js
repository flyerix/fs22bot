const axios = require('axios');
const xml2js = require('xml2js');

async function getFS22ServerStatus(xmlUrl) {
  try {
    const response = await axios.get(xmlUrl, { timeout: 10000 });
    const xmlData = response.data;

    console.log('📋 XML RAW DATA:', xmlData); // Questo mostrerà l'XML completo

    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const result = await parser.parseStringPromise(xmlData);

    console.log('📊 PARSED XML STRUCTURE:', JSON.stringify(result, null, 2)); // Questo mostrerà la struttura completa

    // CONTINUA CON IL CODICE NORMALE...
    const serverInfo = result.Server;
    
    if (!serverInfo) {
      throw new Error('Struttura XML non valida - elemento Server non trovato');
    }

    // Estrazione dati con fallback sicuri
    const isOnline = true;
    const currentPlayers = parseInt(serverInfo.CurrentPlayers || serverInfo.currentPlayers || '0');
    const maxPlayers = parseInt(serverInfo.MaxPlayers || serverInfo.maxPlayers || '0');
    const serverName = serverInfo.Name || serverInfo.name || 'Server FS22';
    
    // Estrazione mods più robusta
    let mods = [];
    try {
      if (serverInfo.Mods) {
        if (serverInfo.Mods.Mod && Array.isArray(serverInfo.Mods.Mod)) {
          mods = serverInfo.Mods.Mod.map(mod => {
            return mod.Name || mod.name || mod['$']?.name || 'Mod sconosciuta';
          }).filter(name => name !== 'Mod sconosciuta');
        } else if (serverInfo.Mods.Mod) {
          // Caso singola mod
          const modName = serverInfo.Mods.Mod.Name || serverInfo.Mods.Mod.name || serverInfo.Mods.Mod['$']?.name;
          if (modName) mods = [modName];
        }
      }
    } catch (modError) {
      console.log('⚠️ Errore estrazione mods:', modError.message);
    }

    console.log(`✅ Server: ${serverName}, Players: ${currentPlayers}/${maxPlayers}, Mods: ${mods.length}`);

    return {
      isOnline,
      players: currentPlayers,
      maxPlayers: maxPlayers,
      serverName: serverName,
      mods: mods
    };

  } catch (error) {
    console.error('❌ Errore nel fetch dei dati XML del server:', error.message);
    return {
      isOnline: false,
      players: 0,
      maxPlayers: 0,
      serverName: 'Server Offline',
      mods: []
    };
  }
}

module.exports = { getFS22ServerStatus };
