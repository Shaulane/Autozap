import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import http from 'http';
import QRCode from 'qrcode'; // Ferramenta nova que vai desenhar o QR Code

let qrCodeAtual = ''; // Guarda o QR code mais recente

// Nosso site que agora exibe o QR Code de verdade!
const port = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  if (qrCodeAtual) {
    try {
      const imagemBase64 = await QRCode.toDataURL(qrCodeAtual);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2>Conectar Automação Mentes Prósperas</h2>
          <p>Escaneie o QR Code abaixo com seu WhatsApp Business</p>
          <img src="${imagemBase64}" style="background:white; padding:15px; border-radius:10px; width:300px; height:300px;" />
          <p style="color:#aaa; font-size:12px; margin-top:20px;">Atualize a página se demorar muito para escanear.</p>
        </html>
      `);
    } catch (e) {
      res.end('Erro ao gerar a imagem.');
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h2>✅ Robô conectado ou aguardando gerar QR Code...</h2><p>Atualize a página em alguns segundos.</p></html>');
  }
}).listen(port, () => {
  console.log('Site do QR Code online!');
});

const sessionDir = path.resolve('./whatsapp_sessions');

async function iniciarRobo() {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
    auth: state,
    browser: ['Painel Mentes Prosperas', 'Chrome', '1.0.0'],
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeAtual = qr;
      console.log('✅ NOVO QR CODE PRONTO! Abra seu site para escanear:');
      console.log('👉 https://autozap-o00z.onrender.com');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      qrCodeAtual = ''; // Limpa o QR code antigo
      if (shouldReconnect) {
        iniciarRobo();
      }
    } else if (connection === 'open') {
      qrCodeAtual = ''; // Já conectou, limpa a tela!
      console.log('🚀 SUCESSO ABSOLUTO! WhatsApp conectado!');
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.key.fromMe && msg.message) {
        console.log('Mensagem recebida do lead!');
    }
  });
}

iniciarRobo();
