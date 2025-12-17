'use strict';

const https = require('https');

function jsonResponse(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    },
    body: JSON.stringify(bodyObj)
  };
}

function buildCorsHeaders(origin) {
  const allowed = (process.env.ALLOWED_ORIGINS || '*').trim();
  if (allowed === '*' || !origin) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
  }

  const list = allowed.split(',').map(s => s.trim()).filter(Boolean);
  const ok = list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : list[0] || '',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function postJson(url, payload, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(payload);

    const req = https.request({
      method: 'POST',
      protocol: u.protocol,
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        const ct = (res.headers['content-type'] || '').toString();
        if (ct.includes('application/json')) {
          try {
            resolve({ status, json: JSON.parse(chunks || '{}'), raw: chunks });
          } catch (e) {
            resolve({ status, json: null, raw: chunks });
          }
        } else {
          resolve({ status, json: null, raw: chunks });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Upstream timeout'));
    });
    req.write(data);
    req.end();
  });
}

function extractTextFromOcrResponse(resp) {
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
    // Visual separation between blocks
    if (ls.length) lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// HTTP entrypoint for Yandex Cloud Functions
// Default API key for Yandex Vision API. This value will be used when no
// VISION_API_KEY environment variable is set. It is provided by the user.
const DEFAULT_VISION_API_KEY = 'AQVN1j-5PmMnopmHXZA00hi9CB_o78yOHHlZI-dbajem7usjsop7kacoencg';

module.exports.handler = async (event) => {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  const cors = buildCorsHeaders(origin);

  if ((event?.httpMethod || '').toUpperCase() === 'OPTIONS') {
    // Preflight request for CORS
    return { statusCode: 204, headers: cors, body: '' };
  }

  if ((event?.httpMethod || '').toUpperCase() !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' }, cors);
  }

  let bodyStr = event?.body || '';
  try {
    if (event?.isBase64Encoded) {
      bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
    }
  } catch (_) {}

  let body;
  try {
    body = JSON.parse(bodyStr || '{}');
  } catch (e) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, cors);
  }

  // Retrieve API key from environment or fallback to the default embedded key.
  const apiKey = (process.env.VISION_API_KEY || DEFAULT_VISION_API_KEY).trim();
  if (!apiKey) {
    return jsonResponse(500, { error: 'VISION_API_KEY is not set' }, cors);
  }

  const image = (body.image || '').trim();
  const mimeType = (body.mimeType || 'JPEG').toString().trim().toUpperCase();
  const languageCodes = Array.isArray(body.languageCodes) ? body.languageCodes : ['ru', 'en'];
  const model = (body.model || 'page').toString().trim();

  if (!image) {
    return jsonResponse(400, { error: 'image (base64) is required' }, cors);
  }

  const payload = {
    mimeType,
    languageCodes,
    model,
    content: image
  };

  // Vision OCR API endpoint
  const url = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';

  const headers = {
    'Authorization': `Api-Key ${apiKey}`,
    // By default the service does not save request data; you can enable logging if needed for support.
    'x-data-logging-enabled': (process.env.DATA_LOGGING_ENABLED || 'false').toString()
  };

  try {
    const upstream = await postJson(url, payload, headers, 20000);
    if (upstream.status < 200 || upstream.status >= 300) {
      return jsonResponse(502, {
        error: 'Vision OCR request failed',
        status: upstream.status,
        details: upstream.json || upstream.raw
      }, cors);
    }

    const text = extractTextFromOcrResponse(upstream.json);
    return jsonResponse(200, { text }, cors);
  } catch (e) {
    return jsonResponse(502, { error: 'Vision OCR request error', details: String(e?.message || e) }, cors);
  }
};
