// Vercel Serverless Function: /api/parse-pdf
// Extrae texto de PDFs e imágenes de forma confiable en el servidor
// Soporta: application/pdf, image/jpeg, image/png, image/webp

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const config = {
    api: {
        bodyParser: false, // Leer el body manualmente como buffer
    },
};

// Lee el body como Buffer
const readBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mime-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const mimeType = req.headers['x-mime-type'] || 'application/pdf';
        const fileBuffer = await readBody(req);

        if (!fileBuffer || fileBuffer.length === 0) {
            return res.status(400).json({ error: 'Archivo vacío o no recibido' });
        }

        if (mimeType === 'application/pdf') {
            // --- Ruta PDF: extraer texto con pdf2json ---
            return new Promise((resolve) => {
                const PDFParser = require('pdf2json');
                const pdfParser = new PDFParser(this, 1);

                pdfParser.on("pdfParser_dataError", errData => {
                    console.error("pdf2json error:", errData.parserError);
                    resolve(res.status(500).json({ error: "No se pudo extraer texto del PDF" }));
                });

                pdfParser.on("pdfParser_dataReady", pdfData => {
                    const text = pdfParser.getRawTextContent().trim();
                    if (!text || text.length < 20) {
                        const base64 = fileBuffer.toString('base64');
                        return resolve(res.status(200).json({
                            type: 'image_pdf',
                            base64,
                            mimeType: 'application/pdf',
                            pages: pdfData.formImage.Pages.length,
                            info: 'PDF escaneado sin texto extraíble. Usar visión IA.'
                        }));
                    }
                    resolve(res.status(200).json({
                        type: 'text',
                        text: text.substring(0, 8000),
                        pages: pdfData.formImage.Pages.length,
                        info: `Texto extraído: ${text.length} caracteres`
                    }));
                });

                pdfParser.parseBuffer(fileBuffer);
            });

        } else if (mimeType.startsWith('image/')) {
            // --- Ruta Imagen: devolver base64 para vision IA ---
            const base64 = fileBuffer.toString('base64');
            return res.status(200).json({
                type: 'image',
                base64,
                mimeType,
                info: `Imagen lista para vision IA (${Math.round(fileBuffer.length / 1024)}KB)`
            });

        } else {
            return res.status(400).json({ error: `Tipo de archivo no soportado: ${mimeType}` });
        }

    } catch (err) {
        console.error('parse-pdf error:', err);
        return res.status(500).json({ error: err.message || 'Error interno al procesar el archivo' });
    }
}
