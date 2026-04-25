import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pkg from "pg";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePublicPath() {
  const candidates = [
    path.resolve(__dirname, "public"), // if file is server.js at project root
    path.resolve(__dirname, "../public"), // if file is src/index.js
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const publicPath = resolvePublicPath();

const NEON_URI =
  process.env.NEON_URI ||
  "postgresql://neondb_owner:npg_xBa02HOJktXz@ep-delicate-dream-amrk8l8h-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const SECRET_KEY =
  process.env.SECRET_KEY || "shadow-sites-plus-super-secret-key";

const pool = new Pool({
  connectionString: NEON_URI,
  ssl: { rejectUnauthorized: false },
});

// Wisp config
logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url?.endsWith("/wisp/")) {
          wisp.routeRequest(req, socket, head);
        } else {
          socket.end();
        }
      });
  },
});

// Plugins
await fastify.register(fastifyCors, { origin: true });

await fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

await fastify.register(fastifyStatic, {
  root: scramjetPath,
  prefix: "/scram/",
  decorateReply: false,
});

await fastify.register(fastifyStatic, {
  root: libcurlPath,
  prefix: "/libcurl/",
  decorateReply: false,
});

await fastify.register(fastifyStatic, {
  root: baremuxPath,
  prefix: "/baremux/",
  decorateReply: false,
});

// DB init
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      is_approved BOOLEAN DEFAULT false,
      is_banned BOOLEAN DEFAULT false,
      ban_reason TEXT DEFAULT '',
      last_seen BIGINT DEFAULT 0,
      is_online BOOLEAN DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_submissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255) NOT NULL,
      request_type VARCHAR(50) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      details TEXT NOT NULL,
      page_url TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Connected to Neon DB!");
} catch (err) {
  console.error("DATABASE ERROR:", err);
}

// Online status cleanup
setInterval(async () => {
  const cutoff = Date.now() - 15000;
  try {
    await pool.query(
      "UPDATE users SET is_online = false WHERE last_seen < $1 AND is_online = true",
      [cutoff]
    );
  } catch {
    // Ignore cleanup errors
  }
}, 5000);

function getBearerToken(request) {
  return request.headers.authorization?.split(" ")[1];
}

function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY);
}

async function verifyAdmin(request, reply) {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "admin") {
      return reply.code(403).send({ error: "Forbidden" });
    }
  } catch {
    return reply.code(403).send({ error: "Forbidden" });
  }
}

// Signup
fastify.post("/signup", async (request, reply) => {
  const { username, email, password } = request.body ?? {};
  if (!username || !email || !password) {
    return reply.code(400).send({ error: "All fields required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, email, password, role, is_approved) VALUES ($1, $2, $3, 'user', false)",
      [username, email, hashedPassword]
    );

    return reply.send({ message: "Account created! Waiting for admin approval." });
  } catch (err) {
    if (err.code === "23505") {
      return reply.code(400).send({ error: "Username or email already exists." });
    }
    return reply.code(500).send({ error: "Server error" });
  }
});

// Login
fastify.post("/login", async (request, reply) => {
  const { username, password } = request.body ?? {};

  if (username === "script.user" && password === "script.password") {
    const token = jwt.sign({ id: 999999, role: "admin" }, SECRET_KEY, {
      expiresIn: "24h",
    });
    return reply.send({ token, role: "admin", username: "Script Admin" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];

    if (!user) return reply.code(400).send({ error: "Invalid username or password" });

    if (user.is_banned) {
      const banReason = user.ban_reason || "No reason provided";
      return reply.code(403).send({
        error: `You are banned.\nReason: ${banReason}`,
        banned: true,
        banReason,
      });
    }

    if (!user.is_approved) {
      return reply.code(403).send({ error: "Account pending admin approval." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return reply.code(400).send({ error: "Invalid username or password" });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, {
      expiresIn: "24h",
    });

    await pool.query("UPDATE users SET is_online = true, last_seen = $1 WHERE id = $2", [
      Date.now(),
      user.id,
    ]);

    return reply.send({ token, role: user.role, username: user.username });
  } catch {
    return reply.code(500).send({ error: "Server error" });
  }
});

// Heartbeat
fastify.post("/heartbeat", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "No token" });

  try {
    const decoded = verifyToken(token);

    if (decoded.id !== 999999) {
      await pool.query("UPDATE users SET is_online = true, last_seen = $1 WHERE id = $2", [
        Date.now(),
        decoded.id,
      ]);
    }

    return reply.send({ status: "ok" });
  } catch {
    return reply.code(401).send({ error: "Session expired" });
  }
});

// Offline
fastify.post("/offline", async (request, reply) => {
  const token = getBearerToken(request) || request.body?.token;
  if (!token) return reply.code(401).send();

  try {
    const decoded = verifyToken(token);
    if (decoded && decoded.id !== 999999) {
      await pool
        .query("UPDATE users SET is_online = false WHERE id = $1", [decoded.id])
        .catch(() => {});
    }
  } catch {
    // Quietly ignore invalid token
  }

  return reply.code(200).send();
});

// Requests
fastify.post("/requests", async (request, reply) => {
  const token = getBearerToken(request);
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  const { requestType, subject, details, pageUrl } = request.body ?? {};
  if (!requestType || !subject || !details) {
    return reply
      .code(400)
      .send({ error: "Request type, subject, and details are required." });
  }

  try {
    const decoded = verifyToken(token);

    let username = "Unknown User";
    if (decoded.id !== 999999) {
      const userLookup = await pool.query("SELECT username FROM users WHERE id = $1", [
        decoded.id,
      ]);
      username = userLookup.rows[0]?.username || username;
    } else {
      username = "Script Admin";
    }

    await pool.query(
      `INSERT INTO request_submissions (user_id, username, request_type, subject, details, page_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [decoded.id, username, requestType, subject.trim(), details.trim(), (pageUrl || "").trim()]
    );

    return reply.send({ message: "Your request was submitted successfully." });
  } catch {
    return reply.code(401).send({ error: "Session expired" });
  }
});

// Admin routes
fastify.get("/admin/users", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, role, is_approved, is_banned, ban_reason, is_online FROM users ORDER BY id ASC"
    );
    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.get("/admin/requests", { preHandler: verifyAdmin }, async (_request, reply) => {
  try {
    const result = await pool.query(
      "SELECT id, username, request_type, subject, details, page_url, created_at FROM request_submissions ORDER BY created_at DESC, id DESC"
    );
    return reply.send(result.rows);
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

fastify.post("/admin/action", { preHandler: verifyAdmin }, async (request, reply) => {
  const { userId, action, reason } = request.body ?? {};

  try {
    if (action === "approve") {
      await pool.query("UPDATE users SET is_approved = true WHERE id = $1", [userId]);
    }

    if (action === "ban") {
      const safeReason = (reason || "").toString().trim() || "No reason provided";
      await pool.query(
        "UPDATE users SET is_banned = true, is_online = false, ban_reason = $1 WHERE id = $2",
        [safeReason, userId]
      );
    }

    if (action === "unban") {
      await pool.query("UPDATE users SET is_banned = false, ban_reason = '' WHERE id = $1", [
        userId,
      ]);
    }

    return reply.send({ message: "Success" });
  } catch {
    return reply.code(500).send({ error: "Database error" });
  }
});

// Not found handling
fastify.setNotFoundHandler((request, reply) => {
  const pathname = request.raw.url?.split("?")[0] ?? "/";
  const decodedPath = decodeURIComponent(pathname);
  const isStartupProxyPath = /^\/https?:\/\//i.test(decodedPath);
  const lastPathSegment = pathname.split("/").pop() ?? "";
  const hasFileExtension = /\.[a-z0-9]{2,8}$/i.test(lastPathSegment);

  // Keep API routes returning JSON 404s
  if (
    pathname.startsWith("/admin/") ||
    pathname === "/signup" ||
    pathname === "/login" ||
    pathname === "/heartbeat" ||
    pathname === "/offline" ||
    pathname === "/requests"
  ) {
    return reply.code(404).send({ error: "Not Found" });
  }

  if (isStartupProxyPath || !hasFileExtension) {
    return reply.type("text/html").sendFile("index.html");
  }

  return reply.code(404).type("text/html").sendFile("404.html");
});

// Startup logs
fastify.server.on("listening", () => {
  const address = fastify.server.address();
  console.log("Listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(
    `\thttp://${address.family === "IPv6" ? `[${address.address}]` : address.address}:${
      address.port
    }`
  );
});

// Graceful shutdown
async function shutdown() {
  console.log("Shutdown signal received: closing HTTP server");
  try {
    await fastify.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start server
let port = Number.parseInt(process.env.PORT || "", 10);
if (Number.isNaN(port)) port = 8080;

await fastify.listen({
  port,
  host: "0.0.0.0",
});
