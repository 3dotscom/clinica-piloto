import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { supabase } from '@/lib/db';

const redis = Redis.fromEnv();
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await req.json();
  const message = update.message ?? update.edited_message;
  if (!message?.chat?.id) return NextResponse.json({ ok: true });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'Telegram no configurado' }, { status: 503 });

  const chatId = String(message.chat.id);
  // El propietario sirve para identificar la clínica; para pacientes usamos la primera clínica Telegram.
  const byOwner = await supabase.from('tenants').select('id, telegram_bot_token').eq('telegram_owner_chat_id', chatId).maybeSingle();
  const tenant = byOwner.data ?? (await supabase.from('tenants').select('id, telegram_bot_token').not('telegram_owner_chat_id', 'is', null).limit(1).maybeSingle()).data;
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const updateId = String(update.update_id ?? `${chatId}:${message.message_id}`);
  const isNew = await redis.set(`dedup:telegram:${updateId}`, '1', { ex: 3600, nx: true });
  if (!isNew) return NextResponse.json({ ok: true });

  const payload = {
    type: message.text ? 'text' : message.document ? 'document' : message.photo ? 'photo' : 'text',
    text: message.text ?? message.caption ?? '',
    mediaId: message.document?.file_id ?? message.photo?.at(-1)?.file_id ?? null,
    timestamp: Date.now(),
  };
  const bufferKey = `buffer:telegram:${tenant.id}:${chatId}`;
  await redis.rpush(bufferKey, JSON.stringify(payload));
  await redis.set(`last_ts:telegram:${tenant.id}:${chatId}`, payload.timestamp, { ex: 60 });
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`,
    body: { channel: 'telegram', tenantId: tenant.id, chatId, triggeredAt: payload.timestamp },
    delay: 4,
  });
  return NextResponse.json({ ok: true });
}
