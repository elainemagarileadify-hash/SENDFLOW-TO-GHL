const express = require('express');
const mysql   = require('mysql2/promise');
const { processarWebhookSendflow } = require('./ghl');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============================================================
// CONEXÃO MySQL (Railway)
// ============================================================
const pool = mysql.createPool({
  host:     process.env.MYSQLHOST     || 'localhost',
  port:     process.env.MYSQLPORT     || 3306,
  user:     process.env.MYSQLUSER     || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'railway',
  waitForConnections: true,
  connectionLimit: 10
});

// ============================================================
// WEBHOOK ENDPOINT — SendFlow
// ============================================================
app.post('/webhook/sendflow', async (req, res) => {
  const payload = req.body;
  console.log(`[Webhook] Recebido: ${payload.event} | ID: ${payload.id}`);

  try {
    // 1. Salvar no MySQL
    const { id, event, data, version } = payload;
    await pool.execute(
      `INSERT INTO sendflow_grupos
        (id, event, campaignId, campaignName, groupName, groupJid, groupId, number, createdAt, version, data_brasil)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        event,
        data?.campaignId   || null,
        data?.campaignName || null,
        data?.groupName    || null,
        data?.groupJid     || null,
        data?.groupId      || null,
        data?.number       || null,
        data?.createdAt    ? new Date(data.createdAt)                      : null,
        version            || null,
        data?.createdAt_with_timezone_br ? new Date(data.createdAt_with_timezone_br) : null
      ]
    );
    console.log(`[MySQL] Registro salvo: ${id}`);

    // 2. Integração GHL (só para evento de membro adicionado)
    const resultadoGHL = await processarWebhookSendflow(payload);
    console.log('[GHL] Resultado:', JSON.stringify(resultadoGHL));

    res.status(200).json({ ok: true, mysql: 'saved', ghl: resultadoGHL });

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
