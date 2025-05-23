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
            background: #282c34; /* Darker background */
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            color: #e0e0e0; /* Light text color */
          }
          .container {
            padding: 30px;
            background: #3a3f47; /* Slightly lighter dark background for container */
            border-radius: 15px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 450px;
            width: 90%;
          }
          h1 {
            color: #61dafb; /* Accent color */
            margin-bottom: 25px;
            font-size: 2em;
          }
          .status {
            margin-bottom: 25px;
            font-size: 1.3rem;
            font-weight: bold;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .status .icon {
            margin-right: 10px;
            font-size: 1.5em;
          }
          .qr-container {
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 0 15px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            min-width: 300px;
            margin-bottom: 25px;
          }
          #qr {
            width: 250px; /* Slightly smaller for better fit */
            height: 250px;
            display: none;
          }
          #placeholder {
            color: #777;
            font-size: 1.1rem;
          }
          .info-text {
            font-size: 0.95rem;
            color: #bbb;
            margin-bottom: 20px;
          }
          .button-group {
            display: flex;
            flex-direction: column; /* Stack buttons vertically on small screens */
            gap: 15px;
            width: 100%;
            max-width: 300px;
            margin: 0 auto;
          }
          .action-button {
            padding: 12px 25px;
            font-size: 1.1rem;
            font-weight: bold;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            color: #fff;
          }
          .action-button.reset {
            background-color: #ff4d4f; /* Red for destructive action */
          }
          .action-button.reset:hover {
            background-color: #cc0000;
            transform: translateY(-2px);
          }
          .action-button.reset:active {
            transform: translateY(0);
          }
          .action-button.connected {
            background-color: #4CAF50; /* Green for success */
          }
          .action-button.connected:hover {
            background-color: #45a049;
            transform: translateY(-2px);
          }
          .action-button.connected:active {
            transform: translateY(0);
          }
          .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            margin-left: 10px;
            display: none; /* Hidden by default */
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media (min-width: 600px) {
            .button-group {
              flex-direction: row; /* Buttons side-by-side on larger screens */
              justify-content: center;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Status do Bot WhatsApp</h1>
          <div class="status" id="status"><span class="icon">🔄</span><span>Carregando status...</span></div>
          <div class="qr-container">
            <img id="qr" src="" alt="QR Code" />
            <div id="placeholder">Aguardando QR Code do bot...</div>
          </div>
          <p class="info-text" id="info-text">
            Mantenha esta página aberta para visualizar o status do bot.
          </p>
          <div class="button-group">
            <button id="resetButton" class="action-button reset">
              Resetar Sessão do Bot <span class="loader" id="resetLoader"></span>
            </button>
            <button id="connectedButton" class="action-button connected">
              Verificar Conexão <span class="loader" id="connectedLoader"></span>
            </button>
          </div>
        </div>

        <script>
          let currentQrImageBase64 = ""; // Para evitar recarregar a mesma imagem

          const statusText = document.getElementById('status');
          const statusIcon = statusText.querySelector('.icon');
          const qrImage = document.getElementById('qr');
          const placeholder = document.getElementById('placeholder');
          const infoText = document.getElementById('info-text');
          const resetButton = document.getElementById('resetButton');
          const connectedButton = document.getElementById('connectedButton');
          const resetLoader = document.getElementById('resetLoader');
          const connectedLoader = document.getElementById('connectedLoader');

          async function fetchStatus() {
            try {
              const res = await fetch('/api/status');
              if (!res.ok) throw new Error('Falha ao buscar status.');
              const data = await res.json();

              if (data.connected) {
                statusIcon.textContent = '✅';
                statusText.querySelector('span:last-child').textContent = 'Bot conectado ao WhatsApp!';
                infoText.textContent = 'O bot está online e pronto para receber mensagens.';
                qrImage.style.display = 'none';
                placeholder.style.display = 'block'; // Esconde o QR e mostra placeholder
                placeholder.textContent = 'Bot conectado. Sem QR Code.';
                resetButton.disabled = false; // Habilita o reset
                connectedButton.style.display = 'none'; // Esconde botão de verificar
              } else if (data.qrAvailable && data.isScanning) {
                statusIcon.textContent = '📱';
                statusText.querySelector('span:last-child').textContent = 'QR Code disponível. Escaneie!';
                infoText.textContent = 'Abra o WhatsApp no seu celular, vá em "Aparelhos Conectados" e escaneie o QR Code acima.';
                connectedButton.style.display = 'block'; // Mostra botão de verificar
              } else {
                statusIcon.textContent = '🔄';
                statusText.querySelector('span:last-child').textContent = 'Aguardando QR Code do bot...';
                infoText.textContent = 'O bot está iniciando ou se reconectando. Um QR Code aparecerá aqui em breve.';
                qrImage.style.display = 'none';
                placeholder.style.display = 'block';
                placeholder.textContent = 'Aguardando QR Code do bot...';
                resetButton.disabled = true; // Desabilita o reset enquanto não há QR
                connectedButton.style.display = 'block'; // Mostra botão de verificar
              }
            } catch (err) {
              statusIcon.textContent = '❌';
              statusText.querySelector('span:last-child').textContent = 'Erro ao buscar status.';
              infoText.textContent = 'Não foi possível se comunicar com o serviço de status. Tente recarregar a página.';
              console.error('Erro ao buscar status:', err);
              resetButton.disabled = true; // Desabilita o reset em caso de erro
              connectedButton.style.display = 'block'; // Mostra botão de verificar
            }
          }

          async function fetchQrImage() {
            try {
              const res = await fetch('/api/qr-image'); // Novo endpoint para pegar a imagem base64
              if (!res.ok) {
                if (res.status === 204) { // No Content
                  qrImage.style.display = 'none';
                  placeholder.style.display = 'block';
                  // Placeholder text set by fetchStatus
                } else {
                  throw new Error('Falha ao buscar imagem do QR.');
                }
                return;
              }
              const data = await res.json();
              const qrImageBase64 = data.qrImage;

              if (qrImageBase64 && qrImageBase64 !== currentQrImageBase64) {
                qrImage.src = qrImageBase64;
                qrImage.style.display = 'block';
                placeholder.style.display = 'none';
                currentQrImageBase64 = qrImageBase64;
              } else if (!qrImageBase64) {
                qrImage.style.display = 'none';
                placeholder.style.display = 'block';
              }
            } catch (err) {
              console.error('Erro ao buscar QR image:', err);
              qrImage.style.display = 'none';
              placeholder.style.display = 'block';
            }
          }

          // Função para chamar o endpoint de reset
          resetButton.addEventListener('click', async () => {
            const confirmReset = confirm("Tem certeza que deseja resetar a sessão do bot? Isso irá desconectá-lo e exigirá um novo escaneamento do QR Code.");
            if (!confirmReset) return;

            resetButton.disabled = true;
            resetLoader.style.display = 'inline-block';
            statusText.querySelector('span:last-child').textContent = 'Reiniciando sessão...';
            statusIcon.textContent = '🔄';
            qrImage.style.display = 'none';
            placeholder.style.display = 'block';
            placeholder.textContent = 'Aguardando novo QR Code...';


            try {
              // A URL do seu bot principal, configure como variável de ambiente no microserviço
              <script>
                const botResetUrl = '${BOT_WEBHOOK_URL}/reset-session';
              </script>
              const res = await fetch(botResetUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                }
              });

              if (res.ok) {
                alert('Sessão do bot resetada com sucesso! Um novo QR Code deve aparecer em breve.');
                // Forçar a busca de status e QR imediatamente após o reset
                await fetchStatus();
                await fetchQrImage();
              } else {
                const errorData = await res.text(); // Pegar texto de erro
                alert(\`Erro ao resetar a sessão do bot: ${res.status} - ${errorData}\`);
                console.error('Erro ao resetar sessão:', res.status, errorData);
              }
            } catch (err) {
              alert('Erro de rede ao tentar resetar a sessão do bot. Verifique a URL ou a conexão.');
              console.error('Erro de rede no reset:', err);
            } finally {
              resetButton.disabled = false;
              resetLoader.style.display = 'none';
            }
          });

          // Função para chamar o endpoint de "conected" (se precisar forçar, mas o bot já envia)
          // Este botão pode ser removido ou transformado em um botão de "Atualizar Status"
          connectedButton.addEventListener('click', async () => {
            connectedButton.disabled = true;
            connectedLoader.style.display = 'inline-block';
            statusText.querySelector('span:last-child').textContent = 'Verificando conexão...';
            statusIcon.textContent = '🔄';

            try {
              // Não há um endpoint no seu bot principal para verificar, apenas para ser notificado
              // Então, este botão aqui apenas força a atualização da página de status
              await fetchStatus();
              await fetchQrImage();
            } catch (err) {
              alert('Erro ao tentar verificar a conexão.');
              console.error('Erro na verificação de conexão:', err);
            } finally {
              connectedButton.disabled = false;
              connectedLoader.style.display = 'none';
            }
          });


          // Executar ao carregar a página
          fetchStatus();
          fetchQrImage();
          setInterval(fetchStatus, 3000); // Atualiza status a cada 3 segundos
          setInterval(fetchQrImage, 8000); // Atualiza QR a cada 8 segundos (QR muda com menos frequência)
        </script>
      </body>
    </html>
    `;
    res.send(html);
});

// Novo endpoint para servir a imagem do QR code em base64 (removendo dependência externa)
app.get('/api/qr-image', (req, res) => {
    if (!qrCodeImageBase64) {
        return res.status(204).json({ qrImage: null }); // 204: No Content
    }
    res.status(200).json({ qrImage: qrCodeImageBase64 });
});


// Ping automático a cada 4 minutos para manter Railway ativo (bot e microserviço)
// **Cuidado:** Este ping está fazendo um GET na sua própria URL principal.
// Para pingar o bot principal, use BOT_WEBHOOK_URL
setInterval(() => {
    axios.get(BOT_WEBHOOK_URL) // Pinga o endpoint principal do bot
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