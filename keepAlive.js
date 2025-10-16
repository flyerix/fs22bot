const express = require("express");
const server = express();

server.all("/", (req, res) => {
  res.send("✅ Bot attivo!");
});

function keepAlive() {
  server.listen(3000, () => {
    console.log("🌐 Server web attivo su porta 3000");
  });
}

module.exports = keepAlive;
