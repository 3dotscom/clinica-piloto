type TelegramResponse = { ok: boolean; result?: unknown; description?: string };

export async function sendTelegramMessage(chatId: string | number, text: string, token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = (await response.json()) as TelegramResponse;
  if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram API error');
  return data;
}

export async function setTelegramWebhook(url: string, token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
  });
  return (await response.json()) as TelegramResponse;
}
