const express = require('express');
const QRCode = require('qrcode'); // <- biblioteca para gerar QR code gráfico

const app = express();
const PORT = process.env.PORT || 8080;

let qrCodeData = '';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Recebe o QR code do bot
app.post('/api/qr', async (req, res) => {
    if (!req.body.qr) {
        return res.status(400).json({ error: 'Campo qr ausente.' });
    }

    qrCodeData = req.body.qr;
    console.log('QR code recebido:', qrCodeData);
    res.status(200).json({ message: 'QR recebido com sucesso' });
});

// Página HTML que exibe o QR code graficamente
app.get('/', async (req, res) => {
    if (!qrCodeData) {
        return res.send('<h2>Nenhum QR Code recebido ainda.</h2>');
    }

    try {
        const qrImageDataUrl = await QRCode.toDataURL(qrCodeData); // gera imagem como data URI

        const html = `
            <html>
              <head><title>QR Code</title></head>
              <body style="display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
                <h2>Escaneie o QR Code abaixo com seu WhatsApp:</h2>
                <img src="${qrImageDataUrl}" alt="QR Code" />
              </body>
            </html>
        `;
        res.send(html);
    } catch (error) {
        console.error('Erro ao gerar QR code:', error);
        res.status(500).send('<h2>Erro ao gerar QR Code.</h2>');
    }
});

// Endpoint opcional de API para pegar o QR como JSON
app.get('/api/qr', (req, res) => {
    if (!qrCodeData) {
        return res.status(204).send(); // Nenhum conteúdo ainda
    }
    res.status(200).json({ qr: qrCodeData });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
