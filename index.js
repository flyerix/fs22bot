const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const fetch = require("node-fetch");
const keepAlive = require("./keepAlive");
require("dotenv").config();

const TOKEN = process.env.TOKEN;
const SERVER_API = process.env.SERVER_API; // es. http://IP:PORT/
const CHANNEL_STATUS = process.env.CHANNEL_STATUS;
const CHANNEL_CHANGELOG = process.env.CHANNEL_CHANGELOG;
const ADMIN_CHANNEL = process.env.ADMIN_CHANNEL || null;
const NOTIFY_ROLE_ID = process.env.NOTIFY_ROLE_ID || null;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Stato e cache
let lastStatus = null;            // "🟢 Online" / "🔴 Offline"
let lastPlayers = null;           // "X/Y"
let lastMods = [];                // array di nomi mod
let notifyEnabled = true;         // toggle per notifiche automatiche
let lastStatusNotifTs = 0;        // timestamp ultima notifica stato (rate limit)
let STATUS_COOLDOWN_MS = 60_000;  // 60s
let MODS_CACHE = {
  list: [],
  fetchedAt: 0,
  ttl: 60_000 // 60s di cache
};

// Registrazione comandi slash
const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("❓ Mostra i comandi disponibili e funzioni del bot"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("📡 Mostra lo stato attuale del server e i giocatori connessi"),
  new SlashCommandBuilder()
    .setName("mods")
    .setDescription("📋 Mostra la lista mod attive e filtri interattivi")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.once("ready", async () => {
  console.log(✅ Bot avviato come ${client.user.tag});
  keepAlive();

  // Registra comandi globali
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Comandi slash registrati");
  } catch (err) {
    console.error("Errore registrazione comandi:", err);
  }

  // Avvio scheduler
  checkServer();
  setInterval(checkServer, 10_000); // ogni 10s per stato/players
  setInterval(checkModsDailyChangelog, 24 * 60 * 60 * 1000); // ogni 24h per changelog
});

// Utility: invio errori ad admin channel
function reportError(message, err) {
  console.error(message, err);
  if (ADMIN_CHANNEL) {
    const channel = client.channels.cache.get(ADMIN_CHANNEL);
    if (channel) channel.send(⚠️ ${message});
  }
}

// Fetch con gestione errori
async function safeFetchJSON(url) {
  try {
    const res = await fetch(url, { timeout: 10_000 });
    if (!res.ok) throw new Error(HTTP ${res.status});
    return await res.json();
  } catch (err) {
    reportError(Errore fetch su ${url}, err);
    throw err;
  }
}

// Componenti UI
function statusComponents() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("status_refresh")
      .setLabel("Aggiorna ora")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("status_toggle_notify")
      .setLabel(notifyEnabled ? "Notifiche: ON" : "Notifiche: OFF")
      .setStyle(notifyEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(notifyEnabled ? "🔔" : "🔕")
  );
}

function modsComponents() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("mods_filter")
      .setPlaceholder("Scegli filtro mod")
      .addOptions(
        { label: "Tutte le mod", value: "all", emoji: "📋" },
        { label: "Aggiunte (rispetto all'ultimo snapshot)", value: "added", emoji: "➕" },
        { label: "Rimosse (rispetto all'ultimo snapshot)", value: "removed", emoji: "➖" }
      )
  );
}

// Embed builders
function buildStatusEmbed(data, manual = false) {
  const status = data.server.isOnline ? "🟢 Online" : "🔴 Offline";
  const players = ${data.slots.used}/${data.slots.capacity};
  const embed = new EmbedBuilder()
    .setTitle("📡 Stato Server FS22")
    .setColor(data.server.isOnline ? 0x2ecc71 : 0xe74c3c)
    .setThumbnail("https://cdn-icons-png.flaticon.com/512/3208/3208679.png")
    .addFields(
      { name: "Stato", value: status, inline: true },
      { name: "Giocatori", value: 👥 ${players}, inline: true }
    )
    .setFooter({ text: manual ? "Richiesta manuale" : "Aggiornamento automatico" })
    .setTimestamp();

  return { embed, status, players };
}

function buildModsEmbed(currentMods, added, removed, manual = false) {
  // Suddivisione lista lunga in blocchi da 1024 caratteri per campo
  const chunk = (arr, size) => {
    const res = [];
    let buf = "";
    for (const item of arr) {
      const piece = String(item);
      if ((buf + (buf ? ", " : "") + piece).length > size) {
        res.push(buf);
        buf = piece;
      } else {
        buf = buf ? ${buf}, ${piece} : piece;
      }
    }
    if (buf) res.push(buf);
    return res;
  };

  const embed = new EmbedBuilder()
    .setTitle("📝 Mod FS22")
    .setColor(manual ? 0xf1c40f : 0x3498db)
    .setThumbnail("https://cdn-icons-png.flaticon.com/512/2921/2921222.png")
    .addFields(
      { name: "📦 Totale attive", value: ${currentMods.length}, inline: true },
      { name: "➕ Aggiunte", value: added.length ? added.join(", ") : "Nessuna", inline: false },
      { name: "➖ Rimosse", value: removed.length ? removed.join(", ") : "Nessuna", inline: false }
    )
    .setFooter({ text: manual ? "Richiesta manuale" : "Aggiornamento giornaliero" })
    .setTimestamp();

  if (currentMods.length) {
    const chunks = chunk(currentMods, 1024);
    chunks.forEach((c, i) => {
      embed.addFields({ name: i === 0 ? "📋 Lista completa" : "Continua", value: c, inline: false });
    });
  } else {
    embed.addFields({ name: "📋 Lista completa", value: "Nessuna mod attiva", inline: false });
  }

  return embed;
}

// Caching mods (TTL)
async function getModsCached() {
  const now = Date.now();
  if (MODS_CACHE.list.length && now - MODS_CACHE.fetchedAt < MODS_CACHE.ttl) {
    return MODS_CACHE.list;
  }
  const modsResp = await safeFetchJSON(SERVER_API + "mods");
  const current = (modsResp || []).map(m => m.name).filter(Boolean);
  MODS_CACHE.list = current;
  MODS_CACHE.fetchedAt = now;
  return current;
}

// Controllo server (automatico con rate limiting)
async function checkServer() {
  try {
    const data = await safeFetchJSON(SERVER_API);
    const { embed, status, players } = buildStatusEmbed(data, false);

    const changed = status !== lastStatus || players !== lastPlayers;
    const now = Date.now();
    const cooldownPassed = now - lastStatusNotifTs >= STATUS_COOLDOWN_MS;

    if (changed) {
      // invia solo se notifiche attive e cooldown rispettato
      if (notifyEnabled && cooldownPassed) {
        const channel = client.channels.cache.get(CHANNEL_STATUS);
        if (channel) {
          const content =
            data.server.isOnline && NOTIFY_ROLE_ID ? <@&${NOTIFY_ROLE_ID}> : null;
          await channel.send({ content, embeds: [embed], components: [statusComponents()] });
          lastStatusNotifTs = now;
        }
      }
      lastStatus = status;
      lastPlayers = players;
    }
  } catch (err) {
    // già gestito da reportError
  }
}

// Changelog mod giornaliero
async function checkModsDailyChangelog() {
  try {
    const currentMods = await getModsCached();
    const added = currentMods.filter(m => !lastMods.includes(m));
    const removed = lastMods.filter(m => !currentMods.includes(m));

    if (added.length  removed.length  currentMods.length !== lastMods.length) {
      const channel = client.channels.cache.get(CHANNEL_CHANGELOG);
      if (channel) {
        const embed = buildModsEmbed(currentMods, added, removed, false);
        await channel.send({ embeds: [embed], components: [modsComponents()] });
      }
    }
    lastMods = currentMods;
  } catch (err) {
    // già gestito da reportError
  }
}
// Listener interazioni (slash + componenti)
client.on("interactionCreate", async interaction => {
  // Comandi slash
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "help") {
      const embed = new EmbedBuilder()
        .setTitle("❓ Help FS22 Bot")
        .setColor(0x95a5a6)
        .setDescription(
          [
            "• /status — Mostra stato server e giocatori, con pulsante Aggiorna e toggle notifiche.",
            "• /mods — Mostra lista mod attive, con menu per filtrare Aggiunte/Rimosse.",
            "• Notifiche automatiche — Stato server (rate-limited) e changelog giornaliero.",
            "• Caching — Le mod sono cacheate per 60s per prestazioni migliori."
          ].join("\n")
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "status") {
      try {
        const data = await safeFetchJSON(SERVER_API);
        const { embed } = buildStatusEmbed(data, true);
        return interaction.reply({ embeds: [embed], components: [statusComponents()] });
      } catch (err) {
        return interaction.reply({ content: "⚠️ Errore nel recupero dello stato del server.", ephemeral: true });
      }
    }

    if (interaction.commandName === "mods") {
      try {
        const current = await getModsCached();
        const added = lastMods.length ? current.filter(m => !lastMods.includes(m)) : [];
        const removed = lastMods.length ? lastMods.filter(m => !current.includes(m)) : [];
        const embed = buildModsEmbed(current, added, removed, true);
        return interaction.reply({ embeds: [embed], components: [modsComponents()] });
      } catch (err) {
        return interaction.reply({ content: "⚠️ Errore nel recupero delle mod.", ephemeral: true });
      }
    }
  }

  // Pulsanti e menu
  if (interaction.isButton()) {
    if (interaction.customId === "status_refresh") {
      try {
        const data = await safeFetchJSON(SERVER_API);
        const { embed } = buildStatusEmbed(data, true);
        return interaction.update({ embeds: [embed], components: [statusComponents()] });
      } catch (err) {
        return interaction.reply({ content: "⚠️ Errore nell'aggiornamento dello stato.", ephemeral: true });
      }
    }

    if (interaction.customId === "status_toggle_notify") {
      notifyEnabled = !notifyEnabled;
      // aggiorna i componenti per riflettere lo stato
      try {
        const data = await safeFetchJSON(SERVER_API);
        const { embed } = buildStatusEmbed(data, true);
        return interaction.update({ embeds: [embed], components: [statusComponents()] });
      } catch {
        // anche senza fetch possiamo aggiornare solo i componenti
        const row = statusComponents();
        return interaction.update({ components: [row] });
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "mods_filter") {
      try {
        const current = await getModsCached();
        const added = lastMods.length ? current.filter(m => !lastMods.includes(m)) : [];
        const removed = lastMods.length ? lastMods.filter(m => !current.includes(m)) : [];

        let filtered = current;
        const choice = interaction.values[0];
        if (choice === "added") filtered = added;
        if (choice === "removed") filtered = removed;

        const embed = buildModsEmbed(filtered, choice === "added" ? added : [], choice === "removed" ? removed : [], true);
        return interaction.update({ embeds: [embed], components: [modsComponents()] });
      } catch (err) {
        return interaction.reply({ content: "⚠️ Errore nel filtrare le mod.", ephemeral: true });
      }
    }
  }
});

client.login(TOKEN);
