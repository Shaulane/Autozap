import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

// Pasta onde a nuvem vai salvar a sua sessão para não pedir QR Code todo dia
const sessionDir = path.resolve('./whatsapp_sessions');

async function iniciarRoboMentesProsperas() {
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  console.log('Iniciando o motor de conexão do WhatsApp...');

  const socket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }) as any,
    printQRInTerminal: true, // Isso fará o QR Code aparecer na tela do Render!
    auth: state,
    browser: ['Painel Admin Cloud', 'Chrome', '1.0.0'],
  });

  // Salva as credenciais automaticamente
  socket.ev.on('creds.update', saveCreds);

  // Monitora a conexão e as quedas
  socket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n✅ [AGUARDANDO LEITURA] Escaneie o QR Code acima com o seu WhatsApp Business!');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log('⚠️ Conexão caiu. Tentando reconectar no servidor Cloud...', shouldReconnect);
      if (shouldReconnect) {
        iniciarRoboMentesProsperas();
      }
    } else if (connection === 'open') {
      console.log('🚀 SUCESSO! WhatsApp X1 conectado e operante na nuvem!');
    }
  });

  // Escuta as mensagens (Deixamos pronto para plugar o funil de ativação depois)
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    
    if (!msg.key.fromMe && msg.message) {
        console.log(`Mensagem recebida de ${msg.key.remoteJid}`);
    }
  });
}

// Liga a máquina assim que o arquivo for executado
iniciarRoboMentesProsperas();
