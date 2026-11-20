import axios from 'axios';

// Utilidad para enviar mensajes vía WhatsApp API
export async function sendWhatsAppMessage(tenant: any, to: string, message: string) {
  const url = `https://graph.facebook.com/v21.0/${tenant.wa_phone_number_id}/messages`;
  try {
    await axios.post(url, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    }, {
      headers: { 'Authorization': `Bearer ${tenant.wa_access_token}` }
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

// Utilidad para descargar archivos desde Meta (imágenes/documentos)
export async function downloadMetaMedia(mediaId: string, accessToken: string) {
  // 1. Obtener URL del archivo
  const mediaUrlRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // 2. Descargar el contenido
  const fileRes = await axios.get(mediaUrlRes.data.url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    responseType: 'arraybuffer'
  });
  
  return Buffer.from(fileRes.data);
}
