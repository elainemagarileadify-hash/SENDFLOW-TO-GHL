const express = require('express');
const { processarWebhookSendflow } = require('./ghl');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================================
// WEBHOOK ENDPOINT — SendFlow → GHL
// ============================================================
app.post('/webhook/sendflow', async (req, res) => {
  const payload = req.body;
  console.log(`[Webhook] Recebido: ${payload.event} | ID: ${payload.id}`);

  try {
    const resultadoGHL = await processarWebhookSendflow(payload);
    console.log('[GHL] Resultado:', JSON.stringify(resultadoGHL));

    res.status(200).json({ ok: true, ghl: resultadoGHL });

  } catch (err) {
    console.error('[Webhook] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'SENDFLOW-TO-GHL', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Server] Rodando na porta ${PORT}`);
});
