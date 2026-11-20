import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';

const redis = Redis.fromEnv();
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// 1. Verificación para Meta Developers
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 2. Recepción de mensajes
export async function POST(req: NextRequest) {
  const body = await req.json();
  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  
  // Si no es un mensaje (ej. estado de entrega), ignoramos
  if (!message) return NextResponse.json({ ok: true });

  const phoneNumberId = value.metadata.phone_number_id;
  const from = message.from;
  const msgId = message.id;

  // Deduplicación
  const isNew = await redis.set(`dedup:${msgId}`, '1', { ex: 3600, nx: true });
  if (!isNew) return NextResponse.json({ ok: true });

  const payload = {
    type: message.type,
    text: message.text?.body ?? '',
    mediaId: message[message.type]?.id ?? null,
    timestamp: Date.now(),
  };

  const bufferKey = `buffer:${phoneNumberId}:${from}`;
  await redis.rpush(bufferKey, JSON.stringify(payload));
  await redis.set(`last_ts:${phoneNumberId}:${from}`, payload.timestamp, { ex: 60 });

  // Disparo del job de procesamiento en 4 segundos
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`,
    body: { phoneNumberId, from, triggeredAt: payload.timestamp },
    delay: 4,
  });

  return NextResponse.json({ ok: true });
}
