import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { supabase } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/telegram';

const redis = Redis.fromEnv();
const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
const MENU_MARKUP = { inline_keyboard: [[{ text: '📅 Pedir cita', callback_data: 'appointment' }], [{ text: '🩺 Ver servicios', callback_data: 'services' }], [{ text: '💬 Hablar con la clínica', callback_data: 'human' }]] };
const ACTION_TEXT: Record<string, string> = { appointment: 'Quiero pedir una cita', services: 'Quiero ver los servicios', human: 'Quiero hablar con la clínica' };
const TIMES = ['09:00', '12:00', '17:00'];

type FlowState = { serviceId?: string; serviceName?: string; date?: string; time?: string; customerName?: string; customerPhone?: string };
const flowKey = (tenantId: string, chatId: string) => `flow:telegram:${tenantId}:${chatId}`;
const readFlow = async (key: string): Promise<FlowState> => (await redis.get<FlowState>(key)) || {};

function nextDays() {
  const out: Array<{ label: string; value: string }> = [];
  const now = new Date();
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const value = d.toISOString().slice(0, 10);
    out.push({ value, label: d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit' }) });
  }
  return out;
}
const dayMarkup = () => ({ inline_keyboard: nextDays().map(d => [{ text: d.label, callback_data: `appt_date:${d.value}` }]) });
const timeMarkup = () => ({ inline_keyboard: TIMES.map(t => [{ text: t, callback_data: `appt_time:${t}` }]) });

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const botToken = tenant.telegram_bot_token || token;
  const updateId = String(update.update_id ?? `${chatId}:${message.message_id ?? callback?.id}`);
  const isNew = await redis.set(`dedup:telegram:${updateId}`, '1', { ex: 3600, nx: true });
  if (!isNew) return NextResponse.json({ ok: true });
  if (callback) await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: callback.id }) }).catch(() => undefined);
  const callbackData = callback?.data as string | undefined;
  const text = callbackData ? (ACTION_TEXT[callbackData] || callbackData) : (message.text ?? message.caption ?? '');
  const key = flowKey(String(tenant.id), chatId);
  const from = message.from ?? {};
  const customerName = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Paciente';
  const customerPhone = message.contact?.phone_number || from.username || chatId;

  if (text === '/start' || text === '/menu') { await sendTelegramMessage(chatId, '¡Hola! ¿En qué podemos ayudarte?', botToken, MENU_MARKUP); return NextResponse.json({ ok: true }); }
  if (callbackData === 'services' || callbackData === 'appointment') {
    const { data: services } = await supabase.from('services').select('id, name, price_eur').eq('tenant_id', tenant.id).limit(20);
    const rows = (services ?? []).map((s: any) => [{ text: `${s.name}${s.price_eur != null ? ` · ${s.price_eur}€` : ''}`, callback_data: `service:${s.id}` }]);
    await sendTelegramMessage(chatId, callbackData === 'appointment' ? 'Selecciona el servicio para tu cita:' : 'Estos son nuestros servicios:', botToken, rows.length ? { inline_keyboard: rows } : MENU_MARKUP);
    return NextResponse.json({ ok: true });
  }
  if (callbackData?.startsWith('service:')) {
    const serviceId = callbackData.slice(8);
    const { data: service } = await supabase.from('services').select('id,name').eq('id', serviceId).maybeSingle();
    await redis.set(key, JSON.stringify({ serviceId, serviceName: service?.name || 'Consulta', customerName, customerPhone }), { ex: 86400 });
    await sendTelegramMessage(chatId, 'Elige uno de los próximos 3 días:', botToken, dayMarkup());
    return NextResponse.json({ ok: true });
  }
  if (callbackData?.startsWith('appt_date:')) {
    const state = await readFlow(key); state.date = callbackData.slice(10); await redis.set(key, JSON.stringify(state), { ex: 86400 });
    await sendTelegramMessage(chatId, 'Selecciona un horario:', botToken, timeMarkup()); return NextResponse.json({ ok: true });
  }
  if (callbackData?.startsWith('appt_time:')) {
    const state = await readFlow(key); state.time = callbackData.slice(10); await redis.set(key, JSON.stringify(state), { ex: 86400 });
    await sendTelegramMessage(chatId, `Confirma tu cita de ${state.serviceName || 'consulta'} el ${state.date} a las ${state.time}.`, botToken, { inline_keyboard: [[{ text: '✅ Confirmar', callback_data: 'appt_confirm' }, { text: '❌ Cancelar', callback_data: 'appt_cancel' }]] }); return NextResponse.json({ ok: true });
  }
  if (callbackData === 'appt_cancel') { await redis.del(key); await sendTelegramMessage(chatId, 'Cita cancelada. Puedes iniciar otra cuando quieras.', botToken, MENU_MARKUP); return NextResponse.json({ ok: true }); }
  if (callbackData === 'appt_confirm') {
    const state = await readFlow(key);
    if (!state.date || !state.time) { await sendTelegramMessage(chatId, 'La selección ha caducado. Empieza de nuevo con Pedir cita.', botToken); return NextResponse.json({ ok: true }); }
    const startsAt = `${state.date}T${state.time}:00`;
    const { error } = await supabase.from('appointments').insert({ tenant_id: tenant.id, customer_phone: state.customerPhone || customerPhone, customer_name: state.customerName || customerName, service_name: state.serviceName || 'Consulta', starts_at: startsAt, deposit_status: 'pending', consent_status: 'pending' });
    if (error) { console.error('appointment insert error', error); await sendTelegramMessage(chatId, 'No se pudo guardar la cita. Inténtalo de nuevo en unos minutos.', botToken); return NextResponse.json({ ok: true }); }
    await redis.del(key); await sendTelegramMessage(chatId, `✅ Cita confirmada para el ${state.date} a las ${state.time}.`, botToken); return NextResponse.json({ ok: true });
  }

  const payload = { kind: callback ? 'callback' : 'message', callback: callbackData ?? null, type: callback ? 'text' : (message.text ? 'text' : message.document ? 'document' : message.photo ? 'photo' : 'text'), text, mediaId: message.document?.file_id ?? message.photo?.at(-1)?.file_id ?? null, timestamp: Date.now() };
  const bufferKey = `buffer:telegram:${tenant.id}:${chatId}`; await redis.rpush(bufferKey, JSON.stringify(payload)); await redis.set(`last_ts:telegram:${tenant.id}:${chatId}`, payload.timestamp, { ex: 60 });
  const job = { channel: 'telegram', tenantId: tenant.id, chatId, triggeredAt: payload.timestamp };
  try { await qstash.publishJSON({ url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`, body: job, delay: 4 }); } catch (error) { console.error('QStash no disponible; procesando Telegram en línea', error); await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job) }); }
  return NextResponse.json({ ok: true });
}
