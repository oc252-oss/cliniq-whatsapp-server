/**
 * Servidor WhatsApp Web – Render Ready
 * Compatível com Base44
 * Node.js + Baileys
 */

import express from "express";
import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import fs from "fs";

const app = express();
app.use(express.json());

// =======================
// CONFIG
// =======================
const PORT = process.env.PORT || 3000;
const SESSION_PATH = "./session";
let sock = null;
let latestQR = null;
let status = "idle";

// =======================
// HEALTH CHECK (OBRIGATÓRIO)
// =======================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    whatsapp: status,
  });
});

// =======================
// START WHATSAPP SESSION
// =======================
async function startWhatsApp() {
  if (sock) return;

  if (!fs.existsSync(SESSION_PATH)) {
    fs.mkdirSync(SESSION_PATH);
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      latestQR = await QRCode.toDataURL(qr);
      status = "qr";
      console.log("QR Code gerado");
    }

    if (connection === "open") {
      status = "connected";
      latestQR = null;
      console.log("WhatsApp conectado");
    }

    if (connection === "close") {
      status = "disconnected";
      sock = null;
      console.log("WhatsApp desconectado");
    }
  });
}

// =======================
// BASE44 → GERAR QR CODE
// =======================
app.post("/connect", async (req, res) => {
  try {
    await startWhatsApp();

    // aguarda até 10s pelo QR
    const timeout = Date.now() + 10000;
    while (!latestQR && Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!latestQR) {
      return res.status(408).json({
        success: false,
        message: "QR Code não gerado ainda",
      });
    }

    res.json({
      success: true,
      status: "pending",
      qr_code: latestQR,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// =======================
// RECEBER MENSAGENS (TESTE)
// =======================
app.post("/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!sock) {
    return res.status(400).json({ error: "WhatsApp não conectado" });
  }

  await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: message });
  res.json({ success: true });
});

// =======================
// START SERVER (RENDER)
// =======================
app.listen(PORT, () => {
  console.log("Servidor WhatsApp rodando na porta", PORT);
});
