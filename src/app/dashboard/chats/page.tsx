import { supabase } from '@/lib/db';

export default async function ChatsPage() {
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Chats Activos</h2>
      <div className="bg-white rounded-lg shadow p-6">
        {sessions?.map((session) => (
          <div key={session.id} className="flex justify-between items-center py-4 border-b">
            <div>
              <p className="font-semibold">{session.customer_name || session.customer_phone}</p>
              <p className="text-sm text-gray-500">Estado: {session.status}</p>
            </div>
            <button className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
              {session.status === 'ai_active' ? 'Pausar IA' : 'Reactivar IA'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
