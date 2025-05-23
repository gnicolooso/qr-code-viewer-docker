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
          /* ALTERADO: ID de #qr para #qr-image */
          #qr-image {
            width: 250px; /* Slightly smaller for better fit */
            height: 250px;
            display: none;
          }
          /* ALTERADO: ID de #placeholder para #qr-placeholder */
          #qr-placeholder {
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
            <img id="qr-image" src="" alt="QR Code" />
            <div id="qr-placeholder">Aguardando QR Code do bot...</div>
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
          let currentQrImageBase64 = ""; // Armazena a imagem QR em Base64 para exibição
          let updateInterval; // Para o intervalo de atualização de status/QR
          const CHECK_INTERVAL = 2000; // Intervalo de 2 segundos

          // --- Início das Funções WorkspaceStatus() e WorkspaceQrImage() ---
          async function WorkspaceStatus() {
            try {
              const response = await fetch('/api/status');
              const data = await response.json();

              const statusElement = document.getElementById('status');
              // ALTERADO: Acessando o span dentro do statusElement para o texto principal
              const statusTextSpan = statusElement.querySelector('span:last-child');
              const statusIconSpan = statusElement.querySelector('.icon');
              const infoTextElement = document.getElementById('info-text');

              if (data.connected) {
                statusIconSpan.textContent = '✅';
                statusTextSpan.textContent = 'Bot conectado ao WhatsApp!';
                infoTextElement.textContent = 'Você está conectado ao WhatsApp Web!';
                statusElement.className = 'status connected'; // Adiciona classe de status para estilo
                // Limpa o QR Code se estiver conectado
                currentQrImageBase64 = ""; // IMPORTANTE: Reseta a imagem QR aqui
                document.getElementById('qr-image').style.display = 'none'; // Esconde a imagem
                document.getElementById('qr-placeholder').style.display = 'none'; // Esconde o placeholder
                
                // Nao interromper o intervalo, apenas garantir que o WorkspaceQrImage() seja chamado com 'false'
                // para que a imagem do QR seja escondida. O setInterval já está no window.onload.

              } else if (data.isScanning) {
                statusIconSpan.textContent = '📸';
                statusTextSpan.textContent = 'QR Code disponível. Escaneie!';
                infoTextElement.textContent = 'Escaneie o QR Code com o WhatsApp para conectar.';
                statusElement.className = 'status scanning'; // Adiciona classe de status para estilo
                // O QR deve ser buscado por WorkspaceQrImage()

              } else { // Caso não esteja conectado nem escaneando (Aguardando QR)
                statusIconSpan.textContent = '⏳';
                statusTextSpan.textContent = 'Aguardando QR Code do bot...';
                infoTextElement.textContent = 'O bot está iniciando ou se reconectando. Um QR Code aparecerá aqui em breve.';
                statusElement.className = 'status pending'; // Adiciona classe de status para estilo
                currentQrImageBase64 = ""; // IMPORTANTE: Reseta a imagem QR aqui
                // O display será tratado por WorkspaceQrImage(false)
              }

              // Se não houver QR disponível (nem isScanning, nem qrAvailable), garanta que a imagem seja limpa
              // Isso é redundante com o bloco 'else' acima, mas manter por segurança
              if (!data.qrAvailable && !data.isScanning && !data.connected) {
                  currentQrImageBase64 = "";
              }

              // Chama a função de manipulação do QR Code após a atualização do status
              // Passa 'true' se estiver escaneando OU se o QR estiver disponível (pode estar disponível mas não escaneando ainda)
              WorkspaceQrImage(data.isScanning || data.qrAvailable); 
              
            } catch (error) {
              console.error('Erro ao buscar status:', error);
              const statusElement = document.getElementById('status');
              const statusTextSpan = statusElement.querySelector('span:last-child');
              const statusIconSpan = statusElement.querySelector('.icon');
              const infoTextElement = document.getElementById('info-text');

              statusIconSpan.textContent = '❌';
              statusTextSpan.textContent = 'Erro na Conexão!';
              statusElement.className = 'status error'; // Adiciona classe de status para estilo
              infoTextElement.textContent = 'Não foi possível conectar ao servidor backend.';
              currentQrImageBase64 = ""; // Em caso de erro, limpa o QR
              WorkspaceQrImage(false); // Garante que o QR e placeholder sejam escondidos
            }
          }

          async function WorkspaceQrImage(shouldFetchQr = false) {
            const qrImageElement = document.getElementById('qr-image'); // ALTERADO: ID
            const qrPlaceholderElement = document.getElementById('qr-placeholder'); // ALTERADO: ID

            if (shouldFetchQr) { // Só tenta buscar o QR se o status indicar que ele pode estar disponível
              try {
                const response = await fetch('/api/qr-image');
                if (response.status === 204) { // No Content
                  currentQrImageBase64 = ""; // Limpa se não houver QR
                  qrImageElement.style.display = 'none';
                  qrPlaceholderElement.style.display = 'block'; // Mostra placeholder
                  qrPlaceholderElement.textContent = 'Aguardando QR Code do bot...'; // Define texto do placeholder
                } else {
                  const data = await response.json();
                  if (data.qrImage) {
                    currentQrImageBase64 = data.qrImage;
                    qrImageElement.src = currentQrImageBase64;
                    qrImageElement.style.display = 'block'; // Mostra a imagem
                    qrPlaceholderElement.style.display = 'none'; // Esconde o placeholder
                  } else {
                    currentQrImageBase64 = ""; // Limpa se a resposta não tiver imagem
                    qrImageElement.style.display = 'none';
                    qrPlaceholderElement.style.display = 'block'; // Mostra placeholder
                    qrPlaceholderElement.textContent = 'Aguardando QR Code do bot...'; // Define texto do placeholder
                  }
                }
              } catch (error) {
                console.error('Erro ao buscar imagem do QR:', error);
                currentQrImageBase64 = ""; // Em caso de erro, limpa o QR
                qrImageElement.style.display = 'none';
                qrPlaceholderElement.style.display = 'block'; // Mostra placeholder
                qrPlaceholderElement.textContent = 'Erro ao carregar QR. Tente recarregar.'; // Define texto de erro
              }
            } else {
              // Se shouldFetchQr for false (e.g., conectado ou aguardando QR), esconde a imagem
              currentQrImageBase64 = "";
              qrImageElement.style.display = 'none';
              // Decide se mostra o placeholder baseado no status atual do bot
              const statusElement = document.getElementById('status');
              if (statusElement.querySelector('span:last-child').textContent.includes('Aguardando QR')) {
                   qrPlaceholderElement.style.display = 'block';
                   qrPlaceholderElement.textContent = 'Aguardando QR Code do bot...'; // Define texto do placeholder
              } else if (statusElement.querySelector('span:last-child').textContent.includes('Conectado')) {
                   qrPlaceholderElement.style.display = 'block'; // Mostrar placeholder quando conectado
                   qrPlaceholderElement.textContent = 'Bot conectado. Sem QR Code para exibir.';
              } else {
                  qrPlaceholderElement.style.display = 'none'; // Esconde o placeholder em outros casos
              }
            }
          }

          // Função de inicialização e intervalo
          async function fetchStatusAndQrImage() {
              await WorkspaceStatus(); // Chama o status, que por sua vez chama WorkspaceQrImage
          }
          // --- Fim das Funções WorkspaceStatus() e WorkspaceQrImage() ---


          // REMOVIDO: const statusText, statusIcon, qrImage, placeholder, infoText
          // Estes já estão sendo acessados dentro das novas funções ou não são mais necessários diretamente aqui.
          // REMOVIDO: fetchStatus() e fetchQrImage() antigas.
          // O CÓDIGO ABAIXO FOI SIMPLIFICADO E AJUSTADO PARA USAR A NOVA ESTRUTURA.

          // Funções para os botões
          // Adicione event listeners diretamente aos botões
          document.getElementById('resetButton').addEventListener('click', async () => {
              const confirmReset = confirm("Tem certeza que deseja resetar a sessão do bot? Isso irá desconectá-lo e exigirá um novo escaneamento do QR Code.");
              if (!confirmReset) return;

              const resetButton = document.getElementById('resetButton');
              const resetLoader = document.getElementById('resetLoader');
              const statusElement = document.getElementById('status');
              const statusTextSpan = statusElement.querySelector('span:last-child');
              const statusIconSpan = statusElement.querySelector('.icon');
              const qrImageElement = document.getElementById('qr-image');
              const qrPlaceholderElement = document.getElementById('qr-placeholder');

              resetButton.disabled = true;
              resetLoader.style.display = 'inline-block';
              statusTextSpan.textContent = 'Reiniciando sessão...';
              statusIconSpan.textContent = '🔄';
              qrImageElement.style.display = 'none';
              qrPlaceholderElement.style.display = 'block';
              qrPlaceholderElement.textContent = 'Aguardando novo QR Code...';


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
                  // Forçar a busca de status e QR imediatamente após o reset
                  await fetchStatusAndQrImage(); // Usa a nova função unificada
                } else {
                  const errorData = await res.text();
                  alert(\`Erro ao resetar a sessão do bot: \${res.status} - \${errorData}\`);
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

          // Botão "Verificar Conexão" agora apenas força uma atualização dos dados
          document.getElementById('connectedButton').addEventListener('click', async () => {
              const connectedButton = document.getElementById('connectedButton');
              const connectedLoader = document.getElementById('connectedLoader');
              const statusElement = document.getElementById('status');
              const statusTextSpan = statusElement.querySelector('span:last-child');
              const statusIconSpan = statusElement.querySelector('.icon');

              connectedButton.disabled = true;
              connectedLoader.style.display = 'inline-block';
              statusTextSpan.textContent = 'Verificando conexão...';
              statusIconSpan.textContent = '🔄';

              try {
                // Apenas força a atualização do status e QR
                await fetchStatusAndQrImage(); // Usa a nova função unificada
              } catch (err) {
                alert('Erro ao tentar verificar a conexão.');
                console.error('Erro na verificação de conexão:', err);
              } finally {
                connectedButton.disabled = false;
                connectedLoader.style.display = 'none';
              }
          });

          // Inicializa a atualização quando a página carrega
          window.onload = () => {
              fetchStatusAndQrImage(); // Chama na carga inicial
              // REMOVIDO: setInterval(fetchStatus, 3000); e setInterval(fetchQrImage, 8000);
              // Apenas um setInterval é necessário, que chama fetchStatusAndQrImage
              updateInterval = setInterval(fetchStatusAndQrImage, CHECK_INTERVAL);
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