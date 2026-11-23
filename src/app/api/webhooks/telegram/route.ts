import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { supabase } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

const redis = Redis.fromEnv();
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

const MENU_MARKUP = {
  inline_keyboard: [
    [{ text: '📅 Pedir cita', callback_data: 'appointment' }],
    [{ text: '🩺 Ver servicios', callback_data: 'services' }],
    [{ text: '💬 Hablar con la clínica', callback_data: 'human' }],
  ],
};

const ACTION_TEXT: Record<string, string> = {
  appointment: 'Quiero pedir una cita',
  services: 'Quiero ver los servicios',
  human: 'Quiero hablar con la clínica',
};

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const update = await req.json();
  const callback = update.callback_query;
  const message = update.message ?? update.edited_message ?? callback?.message;
  if (!message?.chat?.id) return NextResponse.json({ ok: true });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'Telegram no configurado' }, { status: 503 });

  const chatId = String(message.chat.id);
  const byOwner = await supabase.from('tenants').select('id, telegram_bot_token').eq('telegram_owner_chat_id', chatId).maybeSingle();
  const tenant = byOwner.data ?? (await supabase.from('tenants').select('id, telegram_bot_token').not('telegram_owner_chat_id', 'is', null).limit(1).maybeSingle()).data;
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const updateId = String(update.update_id ?? `${chatId}:${message.message_id ?? callback?.id}`);
  const isNew = await redis.set(`dedup:telegram:${updateId}`, '1', { ex: 3600, nx: true });
  if (!isNew) return NextResponse.json({ ok: true });

  if (callback) {
    // Confirmar el click para que Telegram deje de mostrar el spinner.
    await fetch(`https://api.telegram.org/bot${tenant.telegram_bot_token || token}/answerCallbackQuery`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: callback.id }),
    }).catch(() => undefined);
  }

  const callbackData = callback?.data as string | undefined;
  const text = callbackData ? (ACTION_TEXT[callbackData] || callbackData) : (message.text ?? message.caption ?? '');
  if (text === '/start' || text === '/menu') {
    await sendTelegramMessage(chatId, '¡Hola! ¿En qué podemos ayudarte?', tenant.telegram_bot_token || token, MENU_MARKUP);
    return NextResponse.json({ ok: true });
  }

  const payload = {
    kind: callback ? 'callback' : 'message',
    callback: callbackData ?? null,
    type: callback ? 'text' : (message.text ? 'text' : message.document ? 'document' : message.photo ? 'photo' : 'text'),
    text,
    mediaId: message.document?.file_id ?? message.photo?.at(-1)?.file_id ?? null,
    timestamp: Date.now(),
  };
  const bufferKey = `buffer:telegram:${tenant.id}:${chatId}`;
  await redis.rpush(bufferKey, JSON.stringify(payload));
  await redis.set(`last_ts:telegram:${tenant.id}:${chatId}`, payload.timestamp, { ex: 60 });
  const job = { channel: 'telegram', tenantId: tenant.id, chatId, triggeredAt: payload.timestamp };
  try {
    await qstash.publishJSON({ url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`, body: job, delay: 4 });
  } catch (error) {
    console.error('QStash no disponible; procesando Telegram en línea', error);
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job),
    });
  }
  return NextResponse.json({ ok: true });
}
