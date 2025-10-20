const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();
const config = require('./config.json');
const { getFS22ServerStatus } = require('./utils/fs22ServerUtil');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

let lastStatus = null;
let lastPlayerCount = 0;
let lastUpdateTime = 0;

client.once('ready', () => {
  console.log(`✅ Bot connesso come ${client.user.tag}!`);
  startServerStatusLoop();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'status') {
    await handleStatusCommand(interaction);
  }
});

async function handleStatusCommand(interaction) {
  await interaction.deferReply();

  try {
    const data = await getFS22ServerStatus(config.xmlUrl);
    const statusEmbed = createStatusEmbed(data, false);
    await interaction.editReply({ embeds: [statusEmbed] });
  } catch (error) {
    console.error('Errore comando /status:', error);
    await interaction.editReply({ content: "❌ Errore nel recuperare lo status del server." });
  }
}

function startServerStatusLoop() {
  const channel = client.channels.cache.get(config.channelID);
  if (!channel) {
    console.error("❌ Canale non trovato! Controlla l'ID del canale in config.json");
    return;
  }

  setInterval(async () => {
    try {
      const now = Date.now();
      const data = await getFS22ServerStatus(config.xmlUrl);

      const hasMeaningfulChange = 
        data.isOnline !== lastStatus || 
        data.players !== lastPlayerCount ||
        (now - lastUpdateTime) > config.cooldownPeriod * 5; // Force update every 5 minutes

      if (hasMeaningfulChange && (now - lastUpdateTime) > config.cooldownPeriod) {
        const statusEmbed = createStatusEmbed(data, true);
        
        const messages = await channel.messages.fetch({ limit: 10 });
        const lastBotMessage = messages.find(msg => msg.author.id === client.user.id && msg.embeds.length > 0);

        if (lastBotMessage) {
          await lastBotMessage.edit({ embeds: [statusEmbed] });
        } else {
          await channel.send({ embeds: [statusEmbed] });
        }

        lastStatus = data.isOnline;
        lastPlayerCount = data.players;
        lastUpdateTime = now;
        console.log(`🔄 Status aggiornato. Online: ${data.isOnline}, Players: ${data.players}`);
      }
    } catch (error) {
      console.error('Errore nel loop di aggiornamento:', error);
    }
  }, config.updateInterval);
}

function createStatusEmbed(data, isAutoUpdate) {
  const statusEmoji = data.isOnline ? '🟢' : '🔴';
  const statusText = data.isOnline ? `**Online** ${statusEmoji}` : `**Offline** ${statusEmoji}`;
  const playerText = data.isOnline ? `**${data.players}**/${data.maxPlayers} 👥 in farm` : `- 👥`;
  
  const embed = new EmbedBuilder()
    .setColor(data.isOnline ? '#00FF00' : '#FF0000')
    .setTitle(`🚜 Status Server Farming Simulator 22`)
    .setDescription(`**${data.serverName}**\n\n**Status:** ${statusText}\n**Giocatori:** ${playerText}`)
    .setTimestamp();

  if (isAutoUpdate) {
    embed.setFooter({ text: '🔄 Aggiornamento automatico - Cooldown 60s' });
  }

  if (data.isOnline && data.mods && data.mods.length > 0) {
    const modListText = data.mods.length > 10 ? 
      `${data.mods.slice(0, 10).join(', ')}... e altri ${data.mods.length - 10} mod.` : 
      data.mods.join(', ');
    embed.addFields({ 
      name: `🛠️ Modlist Attive (${data.mods.length})`, 
      value: modListText.length > 1024 ? modListText.substring(0, 1020) + '...' : modListText 
    });
  } else if (data.isOnline) {
    embed.addFields({ name: '🛠️ Modlist', value: 'Nessuna mod attiva o lista non disponibile.' });
  }

  return embed;
}

client.on('ready', async () => {
  try {
    await client.application.commands.set([
      {
        name: 'status',
        description: 'Controlla manualmente lo status del server FS22.',
      },
    ]);
    console.log('✅ Comando slash /status registrato globalmente!');
  } catch (error) {
    console.error('Errore nel registrare i comandi:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);
