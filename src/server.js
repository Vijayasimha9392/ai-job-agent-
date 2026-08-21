const express = require("express");
const path = require("path");
const fs = require("fs");
const config = require("./config/env");
const apiRoutes = require("./api/routes");

function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS middleware for client push registrations
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  // REST API Routes
  app.use("/api", apiRoutes);
  app.get("/health", (req, res) => res.redirect("/api/health"));

  // Static Dashboard & Web Push Client
  const publicDir = path.resolve(__dirname, "../public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  return app;
}

function startServer(port = config.port) {
  const app = createServer();
  const server = app.listen(port, () => {
    console.log(`🌐 [Server] HTTP API & Dashboard active on http://localhost:${port}`);
  });
  return server;
}

module.exports = {
  createServer,
  startServer
};
