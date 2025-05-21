const express = require('express');
const puppeteer = require('puppeteer-core');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

let qrCodeData = '';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post('/qr', async (req, res) => {
    qrCodeData = req.body.qr || '';
    res.sendStatus(200);
});

app.get('/', async (req, res) => {
    if (!qrCodeData) {
        return res.send('<h2>Nenhum QR Code recebido ainda.</h2>');
    }

    const html = `<html><body><pre style="font-size: 10px">${qrCodeData}</pre></body></html>`;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});