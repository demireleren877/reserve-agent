import http from 'node:http';

// Finance Day kayıt senaryosu: gerçek Actuarius araç çağrılarını yapan yerel,
// deterministik OpenAI-uyumlu yanıtlayıcı. Bir genel amaçlı LLM değildir.
const port = 8789;
const model = 'finance-day-scripted-demo';

function completion(message, finishReason = 'stop') {
  return {
    id: `chatcmpl-demo-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', ...message }, finish_reason: finishReason }],
  };
}

function say(content) { return completion({ content, tool_calls: null }); }
function tools(calls) {
  return completion({ content: null, tool_calls: calls.map(([name, args], index) => ({
    id: `demo-${Date.now()}-${index}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  })) }, 'tool_calls');
}

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i;
  return -1;
}

function readableNumber(value) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

function reply(payload) {
  const messages = payload.messages || [];
  const userAt = lastUserIndex(messages);
  const userText = String(messages[userAt]?.content || '');
  const auto = userText.startsWith('(System)');
  const history = messages.slice(0, userAt);
  const current = messages.slice(userAt + 1);
  const calls = current.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name));
  const lastCall = calls.at(-1);
  const priorExcluded = history.some((m) =>
    (m.tool_calls || []).some((c) => c.function?.name === 'exclude_cells'));
  const toolOutputs = current.filter((m) => m.role === 'tool').flatMap((m) => {
    try { return [JSON.parse(m.content)]; } catch { return []; }
  });

  if (!auto && !lastCall) {
    return tools([['load_triangle_from_data', {
      source: 'direct', origin_granularity: 'yearly', development_granularity: 'quarterly',
    }]]);
  }
  if (lastCall === 'load_triangle_from_data') {
    return say('Veri modülündeki FIRE HOME hasar kayıtlarından yıllık kaza dönemi ve çeyreklik gelişim üçgenini kuruyorum. Modelin LDF ve dosya hareketi kontrollerine geçiyorum.');
  }

  if (auto && !priorExcluded) {
    if (!lastCall) return tools([['get_analysis_state', {}]]);
    if (lastCall === 'get_analysis_state') {
      return tools([
        ['get_claim_movement', { origin: '2018', step: 4 }],
        ['get_claim_movement', { origin: '2021', step: 6 }],
      ]);
    }
    if (lastCall === 'get_claim_movement') {
      console.log('claim movement results', JSON.stringify(toolOutputs.filter((o) => o.origin || o.error)));
      const movements = toolOutputs.filter((o) => o.origin && o.top_files);
      const verified = movements.length === 2
        && movements.some((o) => o.origin === '2018' && o.top_files?.[0]?.file_no === 'FH-2018-007')
        && movements.some((o) => o.origin === '2021' && o.top_files?.[0]?.file_no === 'FH-2021-003');
      if (!verified) {
        const refreshed = history.some((m) =>
          (m.tool_calls || []).some((c) => c.function?.name === 'set_method'));
        if (!refreshed) return tools([['set_method', { method: 'volume_weighted' }]]);
        return say('Dosya bazlı LDF hareketleri teyit edilemediği için hücre elemesi uygulamadım; model gözden geçirilmelidir.');
      }
      return tools([['exclude_cells', { cells: [
        { origin: '2018', step: 4 }, { origin: '2021', step: 6 },
      ] }]]);
    }
    if (lastCall === 'exclude_cells') {
      return say('İki tekil LDF gözlemini eledim: 2018 yılı 5→6 gelişiminde FH-2018-007 dosyasının muallağı yaklaşık 712 bin TL, 2021 yılı 7→8 gelişiminde FH-2021-003 dosyasının muallağı yaklaşık 525 bin TL arttı. Bu dosyalar hasar ekibi teyit listesine alınmalı; henüz hasar ekibiyle temas kurulmadı. Diğer gözlemler modelde korunuyor.');
    }
    if (lastCall === 'set_method') return say('Volume-weighted yöntem korunuyor; dosya kırılımı güncellendikten sonra LDF kontrolüne devam ediyorum.');
  }

  if (auto && priorExcluded) {
    if (!lastCall) return tools([['get_analysis_state', {}]]);
    if (lastCall === 'get_analysis_state') {
      const result = toolOutputs.at(-1) || {};
      return say(`FIRE HOME 2026Q2 modeli hazır: 20 yıllık kaza dönemi, çeyreklik gelişim ve ${result.excluded_cells_count ?? 2} belgelenmiş LDF elemesi. Seçili ultimate ${readableNumber(result.total_selected_ultimate)} TL; IBNR ${readableNumber(result.total_selected_ibnr)} TL. Bu rakamlar uygulamanın güncel model durumundan okunmuştur. Sentetik demo verisi kullanılmıştır; dosya gerekçeleri hasar ekibi teyidine açıktır.`);
    }
  }
  return say('Demo senaryosu burada tamamlandı.');
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: model, object: 'model' }] }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404); res.end(); return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 20_000_000) req.destroy();
  });
  req.on('end', () => {
    try {
      const result = reply(JSON.parse(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Scripted demo agent listening on http://127.0.0.1:${port}/v1`));
