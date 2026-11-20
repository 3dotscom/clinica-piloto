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
    .eq(channel === 'telegram' ? 'telegram_bot_token' : 'wa_phone_number_id', channel === 'telegram' ? process.env.TELEGRAM_BOT_TOKEN : phoneNumberId)
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
    .upsert({ tenant_id: tenant.id, customer_phone: from }, { onConflict: 'tenant_id,customer_phone' })
    .select()
    .single();

  if (session.status === 'human_handoff') return NextResponse.json({ paused: true });

  const userText = items.map((i) => i.text).filter(Boolean).join('\n');

  // Generación con IA
  const { text: reply } = await generateText({
    model: 'anthropic/claude-3-5-sonnet-20241022',
    system: tenant.system_prompt,
    messages: [{ role: 'user', content: userText }],
    tools: {
      crearCita: tool({
        description: 'Crea la cita y genera enlace de firma',
        inputSchema: z.object({ customerName: z.string(), serviceName: z.string() }),
        execute: async ({ customerName, serviceName }) => {
            // Lógica de docuseal y supabase aquí...
            return { success: true };
        }
      })
    }
  });

  if (channel === 'telegram') {
    await sendTelegramMessage(recipient, reply, tenant.telegram_bot_token);
  } else {
    await sendWhatsAppMessage(tenant, recipient, reply);
  }
  return NextResponse.json({ ok: true });
}
