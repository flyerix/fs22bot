const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder
} = require("discord.js");
const fetch = require("node-fetch");
const xml2js = require("xml2js");
const keepAlive = require("./keepAlive");
require("dotenv").config();

const TOKEN = process.env.TOKEN;
const SERVER_API = process.env.SERVER_API; // es. http://IP:PORT/state.xml
const CHANNEL_STATUS = process.env.CHANNEL_STATUS;
const CHANNEL_CHANGELOG = process.env.CHANNEL_CHANGELOG;
const ADMIN_CHANNEL = process.env.ADMIN_CHANNEL || null;
const NOTIFY_ROLE_ID = process.env.NOTIFY_ROLE_ID || null;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const parser = new xml2js.Parser({ explicitArray: false });

// Stato e cache
let lastPlayers = null;
let lastMods = [];
let notifyEnabled = true;
let lastStatusNotifTs = 0;
const STATUS_COOLDOWN_MS = 60_000;
let MODS_CACHE = { list: [], fetchedAt: 0, ttl: 60_000 };

// Funzione parsing XML
async function fetchXMLasJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  return await parser.parseStringPromise(text);
}

// Estrattori
async function getServerStatus() {
  const data = await fetchXMLasJSON(SERVER_API);
  const slots = data.Server.Slots.$;
  return {
    online: true,
    name: data.Server.$.name,
    map: data.Server.$.mapName,
    players: ${slots.numUsed}/${slots.capacity}
  };
}

async function getMods() {
  const data = await fetchXMLasJSON(SERVER_API);
  const mods = data.Server.Mods.Mod;
  const modsArray = Array.isArray(mods) ? mods : [mods];
  return modsArray.map(m => ({
    id: m.$.name,
    name: m._,
    author: m.$.author,
    version: m.$.version
  }));
}

// UI componenti
function statusComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("status_refresh").setLabel("Aggiorna ora").setStyle(ButtonStyle.Primary).setEmoji("🔄"),
    new ButtonBuilder().setCustomId("status_toggle_notify").setLabel(notifyEnabled ? "Notifiche: ON" : "Notifiche: OFF").setStyle(notifyEnabled ? ButtonStyle.Success : ButtonStyle.Danger).setEmoji(notifyEnabled ? "🔔" : "🔕")
  );
}

function modsComponents() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId("mods_filter").setPlaceholder("Scegli filtro mod").addOptions(
      { label: "Tutte le mod", value: "all", emoji: "📋" },
      { label: "Aggiunte", value: "added", emoji: "➕" },
      { label: "Rimosse", value: "removed", emoji: "➖" }
    )
  );
}

// Embed builders
function buildStatusEmbed(status, manual = false) {
  return new EmbedBuilder()
    .setTitle("📡 Stato Server FS22")
    .setColor(status.online ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "Server", value: status.name, inline: true },
      { name: "Mappa", value: status.map, inline: true },
      { name: "Giocatori", value: 👥 ${status.players}, inline: true }
    )
    .setFooter({ text: manual ? "Richiesta manuale" : "Aggiornamento automatico" })
    .setTimestamp();
}

function buildModsEmbed(mods, added, removed, manual = false) {
  return new EmbedBuilder()
    .setTitle("📝 Mod FS22")
    .setColor(manual ? 0xf1c40f : 0x3498db)
    .addFields(
      { name: "📦 Totale attive", value: ${mods.length}, inline: true },
      { name: "➕ Aggiunte", value: added.length ? added.map(m => m.name).join(", ") : "Nessuna", inline: false },
      { name: "➖ Rimosse", value: removed.length ? removed.map(m => m.name).join(", ") : "Nessuna", inline: false },
      { name: "📋 Lista completa", value: mods.length ? mods.map(m => ${m.name} (${m.version})).join(", ") : "Nessuna mod attiva", inline: false }
    )
    .setFooter({ text: manual ? "Richiesta manuale" : "Aggiornamento giornaliero" })
    .setTimestamp();
}
// Caching mods
async function getModsCached() {
  const now = Date.now();
  if (MODS_CACHE.list.length && now - MODS_CACHE.fetchedAt < MODS_CACHE.ttl) return MODS_CACHE.list;
  const mods = await getMods();
  MODS_CACHE.list = mods;
  MODS_CACHE.fetchedAt = now;
  return mods;
}

// Controllo server automatico
async function checkServer() {
  try {
    const status = await getServerStatus();
    const changed = status.players !== lastPlayers;
    const now = Date.now();
    const cooldownPassed = now - lastStatusNotifTs >= STATUS_COOLDOWN_MS;

    if (changed && notifyEnabled && cooldownPassed) {
      const channel = client.channels.cache.get(CHANNEL_STATUS);
      if (channel) {
        await channel.send({ embeds: [buildStatusEmbed(status)], components: [statusComponents()] });
        lastStatusNotifTs = now;
      }
    }
    lastPlayers = status.players;
  } catch {
    // server offline
  }
}

// Changelog mod giornaliero
async function checkModsDailyChangelog() {
  const current = await getModsCached();
  const added = current.filter(m => !lastMods.find(x => x.id === m.id));
  const removed = lastMods.filter(m => !current.find(x => x.id === m.id));
  if (added.length  removed.length  current.length !== lastMods.length) {
    const channel = client.channels.cache.get(CHANNEL_CHANGELOG);
    if (channel) await channel.send({ embeds: [buildModsEmbed(current, added, removed)], components: [modsComponents()] });
  }
  lastMods = current;
}

// Comandi slash
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("❓ Mostra i comandi disponibili"),
  new SlashCommandBuilder().setName("status").setDescription("📡 Mostra lo stato del server"),
  new SlashCommandBuilder().setName("mods").setDescription("📋 Mostra la lista mod attive")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log(✅ Bot avviato come ${client.user.tag});
  keepAlive();
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  checkServer();
  setInterval(checkServer, 10_000);
  setInterval(checkModsDailyChangelog, 24 * 60 * 60 * 1000);
});

// Listener interazioni
client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("❓ Help FS22 Bot")
        .setColor(0x95a5a6)
        .setDescription("• /status — Stato server e giocatori\n• /mods — Lista mod attive\n• Notifiche automatiche e changelog giornaliero")
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "status") {
      try {
        const status = await getServerStatus();
        return interaction.reply({ embeds: [buildStatusEmbed(status, true)], components: [statusComponents()] });
      } catch {
        return interaction.reply("⚠️ Server non raggiungibile (Offline).");
      }
    }

    if (interaction.commandName === "mods") {
      try {
        const current = await getModsCached();
        const added = lastMods.length ? current.filter(m => !lastMods.find(x => x.id === m.id)) : [];
        const removed = lastMods.length ? lastMods.filter(m => !current.find(x => x.id === m.id)) : [];
        return interaction.reply({ embeds: [buildModsEmbed(current, added, removed, true)], components: [modsComponents()] });
      } catch {
        return interaction.reply("⚠️ Errore nel recupero delle mod.");
      }
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "status_refresh") {
      try {
        const status = await getServerStatus();
