import { supabase } from '@/lib/db';

export default async function CitasPage() {
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*')
    .order('starts_at', { ascending: true });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Agenda de Citas</h2>
      <div className="bg-white rounded-lg shadow p-6">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Paciente</th>
              <th className="text-left p-2">Servicio</th>
              <th className="text-left p-2">Fianza</th>
              <th className="text-left p-2">Consentimiento</th>
            </tr>
          </thead>
          <tbody>
            {appointments?.map((app) => (
              <tr key={app.id} className="border-b">
                <td className="p-2">{app.customer_name}</td>
                <td className="p-2">{app.service_name}</td>
                <td className="p-2">
                    <span className={`px-2 rounded ${app.deposit_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {app.deposit_status}
                    </span>
                </td>
                <td className="p-2">
                    <span className={`px-2 rounded ${app.consent_status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {app.consent_status}
                    </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
