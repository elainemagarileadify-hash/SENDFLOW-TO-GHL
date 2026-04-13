// ============================================================
// MÓDULO DE INTEGRAÇÃO COM GoHighLevel (GHL) API v2
// ============================================================

const AUTH_TOKEN   = process.env.GHL_AUTH_TOKEN   || 'Bearer pit-5e116e27-28cc-44af-9bbd-ae58954e71f5';
const BASE_URL     = process.env.GHL_BASE_URL     || 'https://services.leadconnectorhq.com';
const LOCATION_ID  = process.env.GHL_LOCATION_ID  || 'CazZz5eUM1VhCuKcq5sT';
const API_VERSION  = '2021-07-28';

const headers = {
  'Authorization': AUTH_TOKEN,
  'Version': API_VERSION,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

// ============================================================
// NORMALIZAÇÃO DO TELEFONE BRASILEIRO (9º DÍGITO)
// ============================================================
// Números BR podem vir com ou sem o 9º dígito:
//   COM:  55 + DD(2) + 9 + XXXXXXXX(8) = 13 dígitos  ex: 5547988394884
//   SEM:  55 + DD(2) + XXXXXXXX(8)     = 12 dígitos  ex: 554788394884
// Buscamos AMBAS variantes no GHL para evitar duplicatas.

function gerarVariantesTelefone(numero) {
  const limpo = numero.replace(/\D/g, '');
  const variantes = new Set();
  variantes.add(limpo);

  if (!limpo.startsWith('55')) return [...variantes];

  const semPais = limpo.slice(2);

  if (semPais.length === 11) {
    // Tem 9º dígito → gerar versão SEM
    const dd = semPais.slice(0, 2);
    if (semPais[2] === '9') {
      variantes.add('55' + dd + semPais.slice(3));
    }
  } else if (semPais.length === 10) {
    // Não tem 9º dígito → gerar versão COM
    const dd = semPais.slice(0, 2);
    variantes.add('55' + dd + '9' + semPais.slice(2));
  }

  const todas = [...variantes];
  todas.forEach(v => variantes.add('+' + v));
  return [...variantes];
}

// ============================================================
// BUSCAR CONTATO POR TELEFONE
// ============================================================
async function buscarContatoPorTelefone(numero) {
  const variantes = gerarVariantesTelefone(numero);
  console.log(`[GHL] Buscando contato | Variantes: ${variantes.join(', ')}`);

  for (const variante of variantes) {
    try {
      const url = `${BASE_URL}/contacts/?locationId=${LOCATION_ID}&query=${encodeURIComponent(variante)}&limit=1`;
      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        console.error(`[GHL] Erro busca (${response.status}): ${await response.text()}`);
        continue;
      }

      const data = await response.json();
      if (data.contacts && data.contacts.length > 0) {
        console.log(`[GHL] Contato encontrado (variante "${variante}"): ${data.contacts[0].id}`);
        return data.contacts[0];
      }
    } catch (err) {
      console.error(`[GHL] Erro variante "${variante}":`, err.message);
    }
  }

  console.log('[GHL] Nenhum contato encontrado.');
  return null;
}

// ============================================================
// ADICIONAR TAGS A CONTATO EXISTENTE
// ============================================================
async function adicionarTags(contactId, novasTags) {
  try {
    const url = `${BASE_URL}/contacts/${contactId}/tags`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: novasTags })
    });

    if (!response.ok) {
      console.error(`[GHL] Erro tags (${response.status}): ${await response.text()}`);
      return false;
    }

    console.log(`[GHL] Tags adicionadas [${contactId}]: ${novasTags.join(', ')}`);
    return true;
  } catch (err) {
    console.error('[GHL] Erro ao adicionar tags:', err.message);
    return false;
  }
}

// ============================================================
// CRIAR NOVO CONTATO
// ============================================================
async function criarContato(telefone, tags) {
  const limpo = telefone.replace(/\D/g, '');
  const phone = limpo.startsWith('55') ? `+${limpo}` : `+55${limpo}`;

  try {
    const url = `${BASE_URL}/contacts/`;
    const body = {
      locationId: LOCATION_ID,
      phone,
      tags,
      source: 'SendFlow - Grupo WhatsApp'
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error(`[GHL] Erro criar contato (${response.status}): ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    console.log(`[GHL] Contato criado: ${data.contact?.id} | Tel: ${phone}`);
    return data.contact;
  } catch (err) {
    console.error('[GHL] Erro ao criar contato:', err.message);
    return null;
  }
}

// ============================================================
// PROCESSAR WEBHOOK DO SENDFLOW
// ============================================================
async function processarWebhookSendflow(payload) {
  const { id, event, data, version } = payload;

  if (event !== 'group.updated.members.added') {
    console.log(`[GHL] Evento ignorado: ${event}`);
    return { processed: false, reason: 'evento_ignorado' };
  }

  const telefone = data?.number;
  if (!telefone) {
    console.log('[GHL] Sem número de telefone no payload.');
    return { processed: false, reason: 'sem_telefone' };
  }

  console.log(`[GHL] Lead entrou: "${data.groupName}" | Tel: ${telefone} | Campanha: ${data.campaignName}`);

  const contatoExistente = await buscarContatoPorTelefone(telefone);

  if (contatoExistente) {
    // CONTATO EXISTE → adicionar tag
    const sucesso = await adicionarTags(contatoExistente.id, ['entrou_grupo_t32']);
    return { processed: true, action: 'tag_adicionada', contactId: contatoExistente.id, sucesso };
  } else {
    // CONTATO NÃO EXISTE → criar novo com 3 tags
    const tags = ['entrou_grupo_t32', 'num_somente_grupo_t32', 'omm-ls-lm-t32-lp'];
    const novo = await criarContato(telefone, tags);
    return { processed: true, action: 'contato_criado', contactId: novo?.id || null, sucesso: !!novo };
  }
}

module.exports = {
  processarWebhookSendflow,
  buscarContatoPorTelefone,
  adicionarTags,
  criarContato,
  gerarVariantesTelefone
};
