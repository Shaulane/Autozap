import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  BufferJSON,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { MongoClient } from 'mongodb';
import http from 'http';
import QRCode from 'qrcode';

// 👇 COLE O SEU LINK DO MONGODB AQUI EMBAIXO DENTRO DAS ASPAS 👇
// Lembre-se de trocar o <password> pela sua senha real!
const MONGO_URI = 'mongodb+srv://shaulinhu_db_user:<db_IUoGg11YKKMh2wz1>@cluster0.1thsqmb.mongodb.net/?appName=Cluster0';

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
    res.end('<html style="background:#111; color:white; font-family:sans-serif; text-align:center; padding-top:50px;"><h2>✅ Robô conectado, blindado e operante 24h!</h2></html>');
  }
}).listen(port);

// ==========================================
// CÉREBRO DA PERSISTÊNCIA (MONGODB)
// ==========================================
const mongoClient = new MongoClient(MONGO_URI);

async function useMongoDBAuthState(collectionName: string) {
  await mongoClient.connect();
  const collection = mongoClient.db('whatsapp_api').collection(collectionName);

  const writeData = async (data: any, id: string) => {
    const dataStr = JSON.stringify(data, BufferJSON.replacer);
    await collection.updateOne({ _id: id }, { $set: { data: dataStr } }, { upsert: true });
  };

  const readData = async (id: string) => {
    const doc = await collection.findOne({ _id: id });
    if (doc && doc.data) return JSON.parse(doc.data, BufferJSON.reviver);
    return null;
  };

  const removeData = async (id: string) => {
    await collection.deleteOne({ _id: id });
  };

  const creds = await readData('creds') || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(ids.map(async id => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }));
          return data;
        },
        set: async (data: any) => {
          const tasks: any[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds')
  };
}

async function iniciarRobo() {
  console.log('Conectando ao Banco de Dados...');
  const { state, saveCreds } = await useMongoDBAuthState('sessoes_mentes_prosperas');
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
      console.log('🚀 SUCESSO ABSOLUTO! WhatsApp conectado e BLINDADO no MongoDB!');
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    
    if (!msg.key.fromMe && msg.message) {
        const remoteJid = msg.key.remoteJid!;
        const text = msg.message.conversation || 
                     msg.message.extendedTextMessage?.text || 
                     msg.message.ephemeralMessage?.message?.conversation || 
                     msg.message.ephemeralMessage?.message?.extendedTextMessage?.text || 
                     "";

        const textoMinusculo = text.toLowerCase();
        console.log(`📩 Mensagem de ${remoteJid}: "${text}"`);

        // Funil Principal
        if (textoMinusculo.includes('protocolo') || textoMinusculo.includes('ativar') || textoMinusculo.includes('identidade')) {
            console.log(`🔥 Disparando Funil para: ${remoteJid}`);

            await socket.sendPresenceUpdate('composing', remoteJid);
            await new Promise(r => setTimeout(r, 2000));

            await socket.sendMessage(remoteJid, {
                text: "Opa! Que bom que você chamou. O que te espera aqui não é mais aula teórica, é um Protocolo de Ativação prático. 🚀"
            });

            await socket.sendPresenceUpdate('composing', remoteJid);
            await new Promise(r => setTimeout(r, 3000));

            await socket.sendMessage(remoteJid, {
                text: "O *Protocolo de Identidade Real* é fundamentado em 5 estratégias estruturais que vão direto ao ponto.\n\nVocê já tentou aplicar algo prático assim antes ou é a sua primeira vez?"
            });
        }
    }
  });
}

iniciarRobo();
