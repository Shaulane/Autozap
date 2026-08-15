import makeWASocket, { fetchLatestBaileysVersion, initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { MongoClient } from 'mongodb';
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';

const MONGO_URI = 'mongodb+srv://shaulinhu_db_user:db_IUoGg11YKKMh2wz1@cluster0.1thsqmb.mongodb.net/?appName=Cluster0';

let qrCodeAtual = '';
const port = process.env.PORT || 3000;
const mongoClient = new MongoClient(MONGO_URI);

const app = express();
app.use(cors()); // Abre a porta para o Google AI Studio
app.use(express.json());

// Rota de Status e QR Code
app.get('/', async (req, res) => {
  if (qrCodeAtual) {
    try {
      const img = await QRCode.toDataURL(qrCodeAtual);
      res.send(`<center><h2>Motor Mentes Prósperas</h2><img src="${img}" width="300"/></center>`);
    } catch (e) { res.send('Erro'); }
  } else {
    res.send('<center><h2>✅ API Online e Robô Blindado!</h2></center>');
  }
});

// A ROTA MÁGICA: Recebe os fluxos do seu Painel Front-end
app.post('/api/salvar-fluxo', async (req, res) => {
  try {
    const { gatilho, mensagens } = req.body;
    const db = mongoClient.db('whatsapp_api');
    await db.collection('fluxos').updateOne(
      { gatilho: gatilho },
      { $set: { gatilho: gatilho, mensagens: mensagens } },
      { upsert: true }
    );
    res.status(200).json({ sucesso: true });
  } catch (erro) {
    res.status(500).json({ sucesso: false });
  }
});

app.listen(port, () => console.log('API Express rodando na porta ' + port));

// Conexão do Baileys e MongoDB
async function useMongoDBAuthState(collectionName: string) {
  await mongoClient.connect();
  const collection = mongoClient.db('whatsapp_api').collection(collectionName);
  const writeData = async (data: any, id: string) => {
    await collection.updateOne({ _id: id }, { $set: { data: JSON.stringify(data, BufferJSON.replacer) } }, { upsert: true });
  };
  const readData = async (id: string) => {
    const doc = await collection.findOne({ _id: id });
    return doc ? JSON.parse(doc.data, BufferJSON.reviver) : null;
  };
  const creds = await readData('creds') || initAuthCreds();
  return {
    state: { creds, keys: { get: async (type: string, ids: string[]) => { const data: any = {}; await Promise.all(ids.map(async id => data[id] = await readData(`${type}-${id}`))); return data; }, set: async (data: any) => { for (const cat in data) for (const id in data[cat]) await writeData(data[cat][id], `${cat}-${id}`); } } },
    saveCreds: () => writeData(creds, 'creds')
  };
}

async function iniciarRobo() {
  const { state, saveCreds } = await useMongoDBAuthState('sessoes_mentes_prosperas');
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({ version, logger: pino({ level: 'silent' }) as any, printQRInTerminal: false, auth: state });

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', (update) => {
    const { connection, qr } = update;
    if (qr) qrCodeAtual = qr;
    if (connection === 'close') {
      if ((update.lastDisconnect?.error as Boom)?.output?.statusCode !== 401) iniciarRobo();
    } else if (connection === 'open') { qrCodeAtual = ''; }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.key.fromMe && msg.message) {
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
      const remoteJid = msg.key.remoteJid!;
      try {
        const db = mongoClient.db('whatsapp_api');
        // Procura no banco se a palavra que o cliente digitou existe nos seus fluxos
        const config = await db.collection('fluxos').findOne({ gatilho: text.trim() });

        if (config && config.mensagens) {
          for (const msgTexto of config.mensagens) {
            await socket.sendPresenceUpdate('composing', remoteJid);
            await new Promise(r => setTimeout(r, 2000)); // Delay simulando digitação humana
            await socket.sendMessage(remoteJid, { text: msgTexto });
          }
        }
      } catch (erro) { console.log('Erro no fluxo:', erro); }
    }
  });
}
iniciarRobo();
