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
import QRCode from 'qrcode';

let qrCodeAtual = '';

const port = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  if (qrCodeAtual) {
    try {
      const imagemBase64 = await QRCode.toDataURL(qrCodeAtual);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2>Conectar Automação Mentes Prósperas</h2>
          <img src="${imagemBase64}" style="background:white; padding:15px; border-radius:10px; width:300px; height:300px;" />
        </html>
      `);
    } catch (e) {
      res.end('Erro ao gerar a imagem.');
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h2>✅ Robô conectado e operante 24h!</h2></html>');
  }
}).listen(port);

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
    if (qr) qrCodeAtual = qr;

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      qrCodeAtual = ''; 
      if (statusCode !== DisconnectReason.loggedOut) iniciarRobo();
    } else if (connection === 'open') {
      qrCodeAtual = ''; 
      console.log('🚀 SUCESSO ABSOLUTO! WhatsApp conectado!');
    }
  });

  // 👇 AQUI COMEÇA O CÉREBRO DO FUNIL X1 👇
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    
    if (!msg.key.fromMe && msg.message) {
        const remoteJid = msg.key.remoteJid!;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoMinusculo = text.toLowerCase();

        // Se o lead mandar a palavra-chave
        if (textoMinusculo.includes('protocolo') || textoMinusculo.includes('ativar') || textoMinusculo.includes('identidade')) {
            
            console.log(`Disparando Funil para: ${remoteJid}`);

            // Simula que está digitando por 2 segundos
            await socket.sendPresenceUpdate('composing', remoteJid);
            await new Promise(r => setTimeout(r, 2000));

            // Envia a primeira mensagem quebrando objeção de "cursinho"
            await socket.sendMessage(remoteJid, {
                text: "Opa! Que bom que você chamou. O que te espera aqui não é mais aula teórica, é um Protocolo de Ativação prático. 🚀"
            });

            // Simula digitando a segunda mensagem por 3 segundos
            await socket.sendPresenceUpdate('composing', remoteJid);
            await new Promise(r => setTimeout(r, 3000));

            // Envia a explicação da estrutura
            await socket.sendMessage(remoteJid, {
                text: "O *Protocolo de Identidade Real* é fundamentado em 5 estratégias estruturais que vão direto ao ponto.\n\nVocê já tentou aplicar algo prático assim antes ou é a sua primeira vez?"
            });
        }
    }
  });
}

iniciarRobo();
