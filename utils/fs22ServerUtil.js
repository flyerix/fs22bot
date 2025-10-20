const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Fetches and parses data from the Farming Simulator 22 server XML
 * @param {string} xmlUrl - The complete URL to the server XML
 * @returns {Object} Server status data
 */
async function getFS22ServerStatus(xmlUrl) {
  try {
    const response = await axios.get(xmlUrl, { timeout: 10000 });
    const xmlData = response.data;

    // Parse XML to JavaScript object
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const result = await parser.parseStringPromise(xmlData);

    // Extract data from the XML structure specific to FS22
    const serverInfo = result.Server;
    
    if (!serverInfo) {
      throw new Error('Struttura XML non valida');
    }

    // Server is considered online if we get a valid response
    const isOnline = true;
    
    // Extract player information
    const currentPlayers = parseInt(serverInfo.CurrentPlayers) || 0;
    const maxPlayers = parseInt(serverInfo.MaxPlayers) || 0;
    
    // Extract server name
    const serverName = serverInfo.Name || 'Server FS22';
    
    // Extract mods - they might be in different formats in the XML
    let mods = [];
    if (serverInfo.Mods) {
      if (Array.isArray(serverInfo.Mods.Mod)) {
        mods = serverInfo.Mods.Mod.map(mod => mod.Name || mod['$'].name || 'Mod sconosciuta');
      } else if (serverInfo.Mods.Mod) {
        mods = [serverInfo.Mods.Mod.Name || serverInfo.Mods.Mod['$'].name || 'Mod sconosciuta'];
      }
    }

    // Alternative mod extraction if the above doesn't work
    if (mods.length === 0 && serverInfo.Mods) {
      try {
        const modsArray = Object.values(serverInfo.Mods);
        mods = modsArray.filter(mod => typeof mod === 'string' && mod.trim() !== '');
      } catch (e) {
        console.log('Impossibile estrarre lista mods:', e.message);
      }
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
