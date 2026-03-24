'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const UPDATE_TOKEN = process.env.UPDATE_TOKEN || '';
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
function readLatest() {
  try { return fs.existsSync(LATEST_FILE) ? JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8')) : null; }
  catch (e) { console.error('[readLatest]', e.message); return null; }
}
function ensureDataDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
const FALLBACK_SSML = `<speak>Bom dia. Ainda não há novidades de inteligência artificial disponíveis para hoje.<break time="300ms"/>Por favor, tente novamente mais tarde.</speak>`;
const alexa = ssml => ({ version: '1.0', response: { outputSpeech: { type: 'SSML', ssml }, shouldEndSession: true } });
app.get('/health', (req, res) => { const d = readLatest(); res.json({ status: 'ok', hasContent: d !== null, updatedAt: d?.updatedAt || null, uptime: Math.floor(process.uptime()) }); });
app.get('/ai-news', (req, res) => { const d = readLatest(); if (!d?.ssml) { console.warn('[GET /ai-news] fallback'); return res.json(alexa(FALLBACK_SSML)); } console.log(`[GET /ai-news] ${d.updatedAt}`); res.json(alexa(d.ssml)); });
app.get('/ai-news/raw', (req, res) => { const d = readLatest(); res.type('text/xml').send(d?.ssml || FALLBACK_SSML); });
app.post('/update', (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!UPDATE_TOKEN || token !== UPDATE_TOKEN) { console.warn('[POST /update] Token inválido'); return res.status(401).json({ error: 'Unauthorized' }); }
  const { ssml, rawText, source } = req.body;
  if (!ssml || !ssml.includes('<speak>')) return res.status(400).json({ error: 'SSML inválido' });
  ensureDataDir();
  const histDir = path.join(DATA_DIR, 'history');
  if (!fs.existsSync(histDir)) fs.mkdirSync(histDir, { recursive: true });
  const payload = { ssml, rawText: rawText || null, source: source || 'n8n', updatedAt: new Date().toISOString() };
  const date = new Date().toISOString().split('T')[0];
  fs.writeFileSync(path.join(histDir, `${date}.json`), JSON.stringify(payload, null, 2));
  fs.writeFileSync(LATEST_FILE, JSON.stringify(payload, null, 2));
  console.log(`[POST /update] Salvo (${ssml.length} chars)`);
  res.json({ success: true, updatedAt: payload.updatedAt });
});
app.get('/history', (req, res) => {
  const histDir = path.join(DATA_DIR, 'history');
  if (!fs.existsSync(histDir)) return res.json({ entries: [] });
  const files = fs.readdirSync(histDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 7);
  res.json({ entries: files.map(f => { try { const d = JSON.parse(fs.readFileSync(path.join(histDir, f), 'utf8')); return { file: f, updatedAt: d.updatedAt }; } catch { return { file: f, error: 'parse error' }; } }) });
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
ensureDataDir();
app.listen(PORT, '0.0.0.0', () => console.log(`[ai-news-api] :${PORT} | DATA_DIR:${DATA_DIR} | Token:${UPDATE_TOKEN ? 'OK' : 'AUSENTE!'}`));
