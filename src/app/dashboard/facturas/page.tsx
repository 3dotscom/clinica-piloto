import { supabase } from '@/lib/db';

export default async function FacturasPage() {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .order('issue_date', { ascending: false });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Facturas Archivadas</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4">Fecha</th>
              <th className="p-4">Proveedor</th>
              <th className="p-4">Total</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invoices?.map((inv) => (
              <tr key={inv.id} className="border-b">
                <td className="p-4">{inv.issue_date}</td>
                <td className="p-4">{inv.supplier_name}</td>
                <td className="p-4">{inv.total_amount} €</td>
                <td className="p-4">
                  <a 
                    href={`/api/download/${inv.pdf_storage_path}`} 
                    className="text-blue-600 hover:underline"
                    target="_blank"
                  >
                    Descargar PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
