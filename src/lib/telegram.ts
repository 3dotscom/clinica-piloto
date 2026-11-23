type TelegramResponse = { ok: boolean; result?: unknown; description?: string };

export type TelegramReplyMarkup = {
  inline_keyboard?: Array<Array<{ text: string; callback_data: string }>>;
  keyboard?: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
};

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  token = process.env.TELEGRAM_BOT_TOKEN,
  reply_markup?: TelegramReplyMarkup,
) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (reply_markup) body.reply_markup = reply_markup;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
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
