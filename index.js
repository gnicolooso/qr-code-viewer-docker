const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

let qrCodeData = '';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🔄 Corrigido: rota POST esperada pelo bot
app.post('/api/qr', async (req, res) => {
    if (!req.body.qr) {
        return res.status(400).json({ error: 'Campo qr ausente.' });
    }

    qrCodeData = req.body.qr;
    console.log('QR code recebido:', qrCodeData);
    res.status(200).json({ message: 'QR recebido com sucesso' });
});

// 🔍 GET opcional para frontend buscar QR como JSON
app.get('/api/qr', (req, res) => {
    if (!qrCodeData) {
        return res.status(204).send(); // Nenhum conteúdo ainda
    }
    res.status(200).json({ qr: qrCodeData });
});

// 🖼️ Página HTML para exibir o QR como texto
app.get('/', (req, res) => {
    if (!qrCodeData) {
        return res.send('<h2>Nenhum QR Code recebido ainda.</h2>');
    }

    const html = `<html><body><pre style="font-size: 10px">${qrCodeData}</pre></body></html>`;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
