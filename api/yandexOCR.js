export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Ensure body is parsed (Vercel automatically parses JSON for serverless functions)
    const body = req.body || {};

    const image = (body.image || '').trim();
    const mimeType = (body.mimeType || 'JPEG').toString().trim().toUpperCase();
    const languageCodes = Array.isArray(body.languageCodes) && body.languageCodes.length ? body.languageCodes : ['ru', 'en'];
    const model = (body.model || 'page').toString().trim();

    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }

    // Yandex API credentials; use environment variables if provided
    const apiKey = process.env.VISION_API_KEY || 'AQVN1j-5PmMnopmHXZA00hi9CB_o78yOHHlZI-db';
    const folderId = process.env.FOLDER_ID || 'ajem7usjsop7kacoencg';

    // Build payload for Yandex Vision OCR API
    const payload = {
      mimeType: mimeType === 'PNG' ? 'PNG' : 'JPEG',
      languageCodes,
      model,
      content: image
    };

    // Perform POST request to Yandex Vision OCR API
    const upstreamResp = await fetch('https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        // Disable data logging by default
        'x-data-logging-enabled': 'false'
      },
      body: JSON.stringify(payload)
    });

    const upstreamJson = await upstreamResp.json().catch(() => null);

    if (!upstreamResp.ok) {
      return res.status(502).json({
        error: 'Vision OCR request failed',
        status: upstreamResp.status,
        details: upstreamJson || await upstreamResp.text()
      });
    }

    // Extract recognized text from the Yandex response
   export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Ensure body is parsed (Vercel automatically parses JSON for serverless functions)
    const body = req.body || {};

    const image = (body.image || '').trim();
    const mimeType = (body.mimeType || 'JPEG').toString().trim().toUpperCase();
    const languageCodes = Array.isArray(body.languageCodes) && body.languageCodes.length ? body.languageCodes : ['ru', 'en'];
    const model = (body.model || 'page').toString().trim();

    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }

    // Yandex API credentials; use environment variables if provided
    const apiKey = process.env.VISION_API_KEY || 'AQVN1j-5PmMnopmHXZA00hi9CB_o78yOHHlZI-db';
    const folderId = process.env.FOLDER_ID || 'ajem7usjsop7kacoencg';

    // Build payload for Yandex Vision OCR API
    const payload = {
      mimeType: mimeType === 'PNG' ? 'PNG' : 'JPEG',
      languageCodes,
      model,
      content: image
    };

    // Perform POST request to Yandex Vision OCR API
    const upstreamResp = await fetch('https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText', {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
        // Disable data logging by default
        'x-data-logging-enabled': 'false'
      },
      body: JSON.stringify(payload)
    });

    const upstreamJson = await upstreamResp.json().catch(() => null);

    if (!upstreamResp.ok) {
      return res.status(502).json({
        error: 'Vision OCR request failed',
        status: upstreamResp.status,
        details: upstreamJson || await upstreamResp.text()
      });
    }

    // Extract recognized text from the Yandex response
    const extractTextFromOcrResponse = (resp) => {
      const ta =
        resp?.textAnnotation ||
        resp?.result?.textAnnotation ||
        resp?.response?.textAnnotation ||
        null;
      if (!ta) return '';

      const blocks = Array.isArray(ta.blocks) ? ta.blocks : [];
      const lines = [];
      for (const b of blocks) {
        const ls = Array.isArray(b.lines) ? b.lines : [];
        for (const l of ls) {
          if (l && typeof l.text === 'string') {
            lines.push(l.text);
          }
        }
        if (ls.length) lines.push('');
      }
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    };

    const text = extractTextFromOcrResponse(upstreamJson);

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e) });
  }
}
 const extractTextFromOcrResponse = (resp) => {
      const ta =
        resp?.textAnnotation ||
        resp?.result?.textAnnotation ||
        resp?.response?.textAnnotation ||
        null;
      if (!ta) return '';

      const blocks = Array.isArray(ta.blocks) ? ta.blocks : [];
      const lines = [];
      for (const b of blocks) {
        const ls = Array.isArray(b.lines) ? b.lines : [];
        for (const l of ls) {
          if (l && typeof l.text === 'string') {
            lines.push(l.text);
          }
        }
        if (ls.length) lines.push('');
      }
      return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    };

    const text = extractTextFromOcrResponse(upstreamJson);

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Server error', details: String(e) });
  }
}
