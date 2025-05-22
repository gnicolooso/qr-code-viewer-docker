const express = require('express');
const QRCode = require('qrcode'); // <- biblioteca para gerar QR code gráfico
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Variáveis de estado
let qrCodeData = null;
let lastQrTimestamp = null;
let isConnected = false;

// Recebe o QR code do bot
app.post('/api/qr', express.json(), (req, res) => {
  const { qr } = req.body;

  if (!qr || typeof qr !== 'string') {
    return res.status(400).json({ error: 'QR inválido ou ausente.' });
  }

  qrCodeData = qr;
  lastQrTimestamp = new Date();
  console.log('[QR RECEBIDO]', lastQrTimestamp.toISOString());

  res.status(200).json({ success: true });
});

    // Página HTML que exibe o QR code graficamente
app.get('/', async (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>QR Code - WhatsApp Bot</title>
        <style>
          body {
            background: #f0f4f8;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .status {
            margin-bottom: 20px;
            font-size: 1.2rem;
            font-weight: bold;
            color: #333;
          }
          .qr-container {
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 0 12px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 320px;
            min-width: 320px;
          }
          #qr {
            width: 300px;
            height: 300px;
            display: none;
          }
          #placeholder {
            color: #aaa;
            font-size: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="status" id="status">🔄 Carregando status...</div>
        <div class="qr-container">
          <img id="qr" src="" alt="QR Code" />
          <div id="placeholder">QR Code não disponível.</div>
        </div>

        <script>
          let lastQrData = "";

          async function fetchStatus() {
            try {
              const res = await fetch('/status');
              const data = await res.json();
              const statusText = document.getElementById('status');

              if (data.connected) {
                statusText.textContent = '✅ Bot conectado ao WhatsApp!';
              } else if (data.qrUpdated) {
                statusText.textContent = '📱 QR Code disponível para escanear.';
              } else {
                statusText.textContent = '🔄 Aguardando novo QR Code...';
              }
            } catch (err) {
              document.getElementById('status').textContent = '❌ Erro ao buscar status.';
            }
          }

          async function fetchQr() {
            try {
              const res = await fetch('/api/qr');
              if (!res.ok) return;

              const data = await res.json();
              const qrData = data.qr;
              const qrImage = document.getElementById('qr');
              const placeholder = document.getElementById('placeholder');

              if (qrData && qrData !== lastQrData) {
                qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?data=' + encodeURIComponent(qrData) + '&size=300x300';
                qrImage.style.display = 'block';
                placeholder.style.display = 'none';
                lastQrData = qrData;
              } else if (!qrData) {
                qrImage.style.display = 'none';
                placeholder.style.display = 'block';
              }
            } catch (err) {
              console.error('Erro ao buscar QR:', err);
            }
          }

          fetchStatus();
          fetchQr();
          setInterval(fetchStatus, 2000);  // Atualiza status
          setInterval(fetchQr, 5000);      // Atualiza QR
        </script>
      </body>
    </html>
  `;
  res.send(html);
});



// Endpoint opcional de API para pegar o QR como JSON
app.get('/api/qr', (req, res) => {
  if (!qrCodeData) {
    return res.status(204).json({ qr: null });  // 204: No Content
  }

  res.status(200).json({ qr: qrCodeData });
});


// Endpoint para status (conectado / QR atualizado)
app.get('/status', (req, res) => {
    const now = new Date();
    const qrUpdated = lastQrTimestamp ? ((now - lastQrTimestamp) < 1000 * 60 * 5) : false;

    res.json({
        connected: isConnected,
        qrUpdated
    });
});

// Endpoint para marcar o bot como conectado
app.post('/api/connected', (req, res) => {
    isConnected = true;
    console.log('✅ Status de conexão recebido: bot está conectado.');
    res.send('Status de conexão atualizado para conectado.');
});

// Ping automático a cada 4 minutos para manter Railway ativo
setInterval(() => {
    axios.get('https://qr-code-viewer-docker-production.up.railway.app/')
        .then(() => console.log('✅ Ping enviado para manter o microserviço ativo.'))
        .catch(err => console.error('❌ Falha no ping automático:', err.message));
}, 1000 * 60 * 4); // a cada 4 minutos

// Inicializa o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
