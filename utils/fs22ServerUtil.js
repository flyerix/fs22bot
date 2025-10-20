const axios = require('axios');
const xml2js = require('xml2js');

async function getFS22ServerStatus(xmlUrl) {
  try {
    const response = await axios.get(xmlUrl, { timeout: 10000 });
    const xmlData = response.data;

    const parser = new xml2js.Parser({ 
      explicitArray: false, 
      mergeAttrs: true,
      ignoreAttrs: false
    });
    
    const result = await parser.parseStringPromise(xmlData);
    
    const serverInfo = result.Server || {};
    
    const isOnline = true;
    const currentPlayers = parseInt(serverInfo.CurrentPlayers || serverInfo.currentPlayers || '0');
    const maxPlayers = parseInt(serverInfo.MaxPlayers || serverInfo.maxPlayers || '4');
    const serverName = serverInfo.Name || serverInfo.name || 'FS22 Server';
    const mapName = serverInfo.MapName || serverInfo.mapName || serverInfo['$']?.mapName || 'Mappa sconosciuta';
    
    // Estrazione mods
    let mods = [];
    try {
      if (serverInfo.Mods) {
        if (serverInfo.Mods.Mod && Array.isArray(serverInfo.Mods.Mod)) {
          mods = serverInfo.Mods.Mod.map(mod => {
            return mod.Name || mod.name || mod['$']?.name || 'Mod sconosciuta';
          }).filter(name => name !== 'Mod sconosciuta');
        } else if (serverInfo.Mods.Mod) {
          const modName = serverInfo.Mods.Mod.Name || serverInfo.Mods.Mod.name || serverInfo.Mods.Mod['$']?.name;
          if (modName) mods = [modName];
        }
      }
    } catch (modError) {
      console.log('⚠️ Errore estrazione mods:', modError.message);
    }

    console.log(`✅ Server: "${serverName}", Mappa: "${mapName}", Players: ${currentPlayers}/${maxPlayers}, Mods: ${mods.length}`);

    return {
      isOnline,
      players: currentPlayers,
      maxPlayers: maxPlayers,
      serverName: serverName,
      mapName: mapName,
      mods: mods
    };

  } catch (error) {
    console.error('❌ Errore nel fetch dei dati XML:', error.message);
    return {
      isOnline: false,
      players: 0,
      maxPlayers: 0,
      serverName: 'Server Offline',
      mapName: 'Mappa sconosciuta',
      mods: [] // Nota: qui non abbiamo i dati, quindi array vuoto. La persistenza sarà gestita in index.js
    };
  }
}

module.exports = { getFS22ServerStatus };
