require('dotenv').config(); // Garante que as variáveis de ambiente do .env sejam carregadas
const express = require('express');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;
const BOT_WEBHOOK_URL = process.env.BOT_WEBHOOK_URL || 'https://vivya-whatsbot-production.up.railway.app'; // URL do seu bot principal

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Variáveis de estado
let qrCodeData = null; // Armazena a string do QR code
let qrCodeImageBase64 = null; // Armazena a imagem do QR code em Base64 para exibir no HTML
let lastQrTimestamp = null;
let isConnected = false;
let isScanning = false; // Novo estado para indicar que está aguardando QR/escaneamento

// --- Endpoints da API ---

// Recebe o QR code do bot
app.post('/api/qr', (req, res) => {
    const { qr } = req.body;

    if (!qr || typeof qr !== 'string') {
        return res.status(400).json({ error: 'QR inválido ou ausente.' });
    }

    qrCodeData = qr;
    lastQrTimestamp = new Date();
    isConnected = false; // Se um novo QR chega, significa que não está mais conectado
    isScanning = true; // Bot está agora no modo de escaneamento
    console.log('[QR RECEBIDO]', lastQrTimestamp.toISOString());

    // Gerar a imagem do QR code em base64 diretamente aqui
    QRCode.toDataURL(qrCodeData, { scale: 8 }, (err, url) => {
        if (err) {
            console.error('Erro ao gerar QR code em Base64:', err);
            qrCodeImageBase64 = null;
            return res.status(500).json({ success: false, error: 'Falha ao gerar imagem do QR.' });
        }
        qrCodeImageBase64 = url;
        console.log('✅ QR code em Base64 gerado.');
        res.status(200).json({ success: true });
    });
});

// Endpoint para status (conectado / QR atualizado / escaneando)
app.get('/api/status', (req, res) => {
    const now = new Date();
    // QR é considerado "atualizado" se foi recebido há menos de 5 minutos e não estamos conectados
    const qrUpdated = qrCodeData && !isConnected && ((now - lastQrTimestamp) < 1000 * 60 * 5);

    res.json({
        connected: isConnected,
        qrAvailable: !!qrCodeData, // Se há dados de QR code disponíveis
        qrUpdated: qrUpdated,
        isScanning: isScanning, // Informa se o bot está aguardando escaneamento
        // Adicione outras informações que possam ser úteis, como uptime do microserviço
    });
});

// Endpoint para marcar o bot como conectado
app.post('/api/connected', (req, res) => {
    isConnected = true;
    isScanning = false; // Não está mais escaneando quando conectado
    qrCodeData = null; // Limpa o QR code quando conectado
    qrCodeImageBase64 = null; // Limpa a imagem do QR
    console.log('✅ Status de conexão recebido: bot está conectado.');
    res.send('Status de conexão atualizado para conectado.');
});

// Endpoint para servir a imagem do QR code em base64 (removendo dependência externa)
app.get('/api/qr-image', (req, res) => {
    if (!qrCodeImageBase64) {
        return res.status(204).json({ qrImage: null }); // 204: No Content
    }
    res.status(200).json({ qrImage: qrCodeImageBase64 });
});


// --- Página HTML que exibe o QR code graficamente ---
app.get('/', async (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Status do Bot - Vivya Whatbot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #222; /* Fundo escuro simples */
            color: #eee; /* Texto claro */
          }
          #status-line {
            margin-bottom: 20px;
            font-size: 1.2em;
          }
          #qr-display {
            width: 250px;
            height: 250px;
            border: 1px solid #555;
            display: flex;
            align-items: center;
            justify-content: center;
            background: white; /* Fundo do QR Code branco */
            margin-bottom: 20px;
          }
          #qr-image {
            max-width: 100%;
            max-height: 100%;
            display: none; /* Inicia escondido */
          }
          #qr-placeholder {
            color: #555;
            text-align: center;
          }
          #reset-link {
            color: #007bff; /* Azul para o link */
            text-decoration: underline;
            cursor: pointer;
          }
          #reset-link:hover {
            color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div id="status-line">Carregando status...</div>
        <div id="qr-display">
          <img id="qr-image" src="" alt="QR Code" />
          <div id="qr-placeholder">Aguardando QR Code...</div>
        </div>
        <a href="#" id="reset-link">Resetar Sessão do Bot</a>

        <script>
          const BOT_WEBHOOK_URL = 'https://vivya-whatsbot-production.up.railway.app'; // Certifique-se de que esta URL está correta
          let currentQrImageBase64 = "";

          async function fetchStatusAndQrImage() {
            const statusLine = document.getElementById('status-line');
            const qrImageElement = document.getElementById('qr-image');
            const qrPlaceholderElement = document.getElementById('qr-placeholder');

            try {
              // Fetch Status
              const statusResponse = await fetch('/api/status');
              const statusData = await statusResponse.json();

              if (statusData.connected) {
                statusLine.textContent = '✅ Bot conectado ao WhatsApp!';
                qrImageElement.style.display = 'none';
                qrPlaceholderElement.style.display = 'block';
                qrPlaceholderElement.textContent = 'Bot conectado. Sem QR Code para exibir.';
                currentQrImageBase64 = "";
              } else if (statusData.isScanning) {
                statusLine.textContent = '📸 QR Code disponível. Escaneie!';
                // Fetch QR Image
                const qrResponse = await fetch('/api/qr-image');
                if (qrResponse.status === 204) { // No Content
                  statusLine.textContent = '⏳ Aguardando QR Code...';
                  qrImageElement.style.display = 'none';
                  qrPlaceholderElement.style.display = 'block';
                  qrPlaceholderElement.textContent = 'Aguardando QR Code...';
                  currentQrImageBase64 = "";
                } else {
                  const qrData = await qrResponse.json();
                  if (qrData.qrImage && qrData.qrImage !== currentQrImageBase64) {
                    currentQrImageBase64 = qrData.qrImage;
                    qrImageElement.src = currentQrImageBase64;
                    qrImageElement.style.display = 'block';
                    qrPlaceholderElement.style.display = 'none';
                  } else if (!qrData.qrImage) {
                    statusLine.textContent = '⏳ Aguardando QR Code...';
                    qrImageElement.style.display = 'none';
                    qrPlaceholderElement.style.display = 'block';
                    qrPlaceholderElement.textContent = 'Aguardando QR Code...';
                    currentQrImageBase64 = "";
                  }
                }
              } else {
                statusLine.textContent = '⏳ Aguardando QR Code do bot...';
                qrImageElement.style.display = 'none';
                qrPlaceholderElement.style.display = 'block';
                qrPlaceholderElement.textContent = 'Aguardando QR Code...';
                currentQrImageBase64 = "";
              }
            } catch (error) {
              console.error('Erro ao buscar status ou QR:', error);
              statusLine.textContent = '❌ Erro de conexão com o backend!';
              qrImageElement.style.display = 'none';
              qrPlaceholderElement.style.display = 'block';
              qrPlaceholderElement.textContent = 'Erro ao carregar. Tente recarregar a página.';
              currentQrImageBase64 = "";
            }
          }

          document.getElementById('reset-link').addEventListener('click', async (event) => {
            event.preventDefault(); // Impede o comportamento padrão do link
            const confirmReset = confirm("Tem certeza que deseja resetar a sessão do bot? Isso irá desconectá-lo e exigirá um novo escaneamento do QR Code.");
            if (!confirmReset) return;

            const statusLine = document.getElementById('status-line');
            statusLine.textContent = '🔄 Reiniciando sessão...';

            try {
              const botResetUrl = \`${BOT_WEBHOOK_URL}/reset-session\`;
              const res = await fetch(botResetUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                }
              });

              if (res.ok) {
                alert('Sessão do bot resetada com sucesso! Um novo QR Code deve aparecer em breve.');
                await fetchStatusAndQrImage(); // Atualiza o status e QR imediatamente
              } else {
                const errorText = await res.text();
                alert(\`Erro ao resetar a sessão: \${res.status} - \${errorText}\`);
                console.error('Erro ao resetar sessão:', res.status, errorText);
              }
            } catch (err) {
              alert('Erro de rede ao tentar resetar a sessão do bot. Verifique a URL ou a conexão.');
              console.error('Erro de rede no reset:', err);
            } finally {
              // A UI será atualizada pelo fetchStatusAndQrImage ou pelo próximo ciclo do setInterval
            }
          });

          // Inicia a atualização quando a página carrega e a cada 3 segundos
          window.onload = () => {
            fetchStatusAndQrImage();
            setInterval(fetchStatusAndQrImage, 3000);
          };
        </script>
      </body>
    </html>
    `;
    res.send(html);
});

// Ping automático a cada 4 minutos para manter Railway ativo (bot e microserviço)
setInterval(() => {
    // Pinga o endpoint principal do bot
    axios.get(BOT_WEBHOOK_URL)
        .then(() => console.log('✅ Ping enviado para o bot principal para mantê-lo ativo.'))
        .catch(err => console.error('❌ Falha no ping automático do bot principal:', err.message));

    // Opcional: Se quiser pingar a si mesmo para garantir que o microserviço está ativo
    axios.get(`http://localhost:${PORT}/api/status`) // Ping interno no próprio microserviço
        .then(() => console.log('✅ Ping interno no microserviço para mantê-lo ativo.'))
        .catch(err => console.error('❌ Falha no ping interno do microserviço:', err.message));
}, 1000 * 60 * 4); // a cada 4 minutos


// Inicializa o servidor
app.listen(PORT, () => {
    console.log(`🚀 Microserviço de QR Code rodando em http://localhost:${PORT}`);
    // A cada inicialização, o microserviço informa ao bot que ele precisa de um QR code
    // Isso é útil se o microserviço reiniciar e perder o estado, mas o bot ainda estiver lá
    axios.post(`${BOT_WEBHOOK_URL}/api/request-qr`)
        .then(() => console.log('✅ Solicitação de QR code enviada ao bot principal na inicialização.'))
        .catch(err => console.warn('⚠️ Não foi possível solicitar QR code do bot principal na inicialização (bot pode não ter o endpoint ou estar offline):', err.message));

});