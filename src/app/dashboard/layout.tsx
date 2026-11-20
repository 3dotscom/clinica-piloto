import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6">
        <h1 className="text-xl font-bold mb-8">SaaS Clínica</h1>
        <nav className="space-y-4">
          <Link href="/dashboard/chats" className="block text-gray-600 hover:text-blue-600">💬 Chats & IA</Link>
          <Link href="/dashboard/citas" className="block text-gray-600 hover:text-blue-600">📅 Citas</Link>
          <Link href="/dashboard/facturas" className="block text-gray-600 hover:text-blue-600">📄 Facturas</Link>
        </nav>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
