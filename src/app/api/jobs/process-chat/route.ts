import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { generateText, tool, stepCountIs, Output } from 'ai';
import { z } from 'zod';
import { DocusealApi } from '@docuseal/api';
import { supabase } from '@/lib/db';
import { sendWhatsAppMessage, downloadMetaMedia } from '@/lib/whatsapp';
import { sendTelegramMessage } from '@/lib/telegram';

const redis = Redis.fromEnv();
const docuseal = new DocusealApi({
  key: process.env.DOCUSEAL_API_KEY!,
  url: 'https://api.docuseal.eu',
});

export async function POST(req: NextRequest) {
  const { channel = 'whatsapp', phoneNumberId, from, chatId, tenantId, triggeredAt } = await req.json();
  const recipient = channel === 'telegram' ? String(chatId) : from;
  const lastKey = channel === 'telegram' ? `last_ts:telegram:${tenantId}:${recipient}` : `last_ts:${phoneNumberId}:${recipient}`;

  // 1. Deduplicación avanzada
  const lastTs = await redis.get<number>(lastKey);
  if (lastTs && lastTs > triggeredAt) {
    return NextResponse.json({ skipped: 'newer_message_exists' });
  }

  const bufferKey = channel === 'telegram' ? `buffer:telegram:${tenantId}:${recipient}` : `buffer:${phoneNumberId}:${recipient}`;
  const rawItems = await redis.lrange<string>(bufferKey, 0, -1);
  await redis.del(bufferKey);
  if (!rawItems.length) return NextResponse.json({ ok: true });

  const items = rawItems.map((i) => (typeof i === 'string' ? JSON.parse(i) : i));

  // 2. Cargar configuración de la clínica
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*, services(*)')
    .eq(channel === 'telegram' ? 'id' : 'wa_phone_number_id', channel === 'telegram' ? tenantId : phoneNumberId)
    .single();
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // 3. Lógica Administrativa vs. Atención al Paciente
  const mediaItem = items.find((i) => i.type === 'image' || i.type === 'document');
  
  if (from === tenant.owner_phone && mediaItem) {
    // --- RAMA ADMINISTRATIVA ---
    const fileBuffer = await downloadMetaMedia(mediaItem.mediaId, tenant.wa_access_token);
    const { output: invoice } = await generateText({
      model: 'openai/gpt-4o-mini', 
      output: Output.object({
        schema: z.object({
          issue_date: z.string().describe('YYYY-MM-DD'),
          supplier_name: z.string(),
          total_amount: z.number(),
          is_readable: z.boolean(),
        }),
      }),
      messages: [{ role: 'user', content: 'Extrae datos básicos de factura' }],
    });

    await supabase.from('invoices').insert({ tenant_id: tenant.id, ...invoice, pdf_storage_path: 'temp' });
    await sendWhatsAppMessage(tenant, from, `✅ Factura archivada: ${invoice.total_amount}€`);
    return NextResponse.json({ ok: true });
  }

  // --- RAMA PACIENTE ---
  const { data: session } = await supabase
    .from('chat_sessions')
    .upsert({ tenant_id: tenant.id, customer_phone: recipient }, { onConflict: 'tenant_id,customer_phone' })
    .select()
    .single();

  if (!session) {
    const message = 'He recibido tu mensaje, pero la sesión aún no está disponible. Inténtalo de nuevo en unos segundos.';
    if (channel === 'telegram') await sendTelegramMessage(recipient, message, tenant.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN);
    else await sendWhatsAppMessage(tenant, recipient, message);
    return NextResponse.json({ ok: true, fallback: 'session_unavailable' });
  }
  if (session.status === 'human_handoff') return NextResponse.json({ paused: true });

  const userText = items.map((i) => i.text).filter(Boolean).join('\n');

  // Generación con Groq (sin Vercel AI Gateway ni tarjeta de Google)
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('Falta GROQ_API_KEY');
  const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      messages: [
        { role: 'system', content: tenant.system_prompt },
        { role: 'user', content: userText },
      ],
    }),
  });
  const aiJson = await aiResponse.json();
  if (!aiResponse.ok) throw new Error(aiJson.error?.message || 'Error de Groq');
  const reply = aiJson.choices?.[0]?.message?.content || 'No he podido generar una respuesta ahora mismo.';

  if (channel === 'telegram') {
    await sendTelegramMessage(recipient, reply, tenant.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN);
  } else {
    await sendWhatsAppMessage(tenant, recipient, reply);
  }
  return NextResponse.json({ ok: true });
}
