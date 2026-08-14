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

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Robo de Vendas do Protocolo de Ativacao X1 esta ON e rodando 24h!\n');
}).listen(port, () => {
  console.log('Servidor web ativo na porta ' + port);
});

const sessionDir = path.resolve('./whatsapp_sessions');

async function iniciarRobo() {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log('Iniciando o motor do WhatsApp...');

  const socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: false,
    auth: state,
    browser: ['Mentes Prosperas', 'Chrome', '1.0.0'],
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrLink = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qr);
      console.log('\n========================================================');
      console.log('✅ QR CODE GERADO COM SUCESSO!');
      console.log('Abra o link abaixo no navegador para ver o QR Code e escanear:');
      console.log(qrLink);
      console.log('========================================================\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('⚠️ Conexão caiu. Reconectando...', shouldReconnect);
      if (shouldReconnect) {
        iniciarRobo();
      }
    } else if (connection === 'open') {
      console.log('🚀 SUCESSO! WhatsApp X1 conectado e operante na nuvem 24h!');
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
