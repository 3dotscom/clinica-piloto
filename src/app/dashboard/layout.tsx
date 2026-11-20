import Link from 'next/link';

const navItems = [
  { href: '/dashboard/chats', label: 'Chats & IA', icon: '◌' },
  { href: '/dashboard/citas', label: 'Citas', icon: '□' },
  { href: '/dashboard/facturas', label: 'Facturas', icon: '▤' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand"><span className="brand-mark">C</span><div><strong>Clínica OS</strong><small>Panel operativo</small></div></div>
        <nav className="nav-list">
          {navItems.map((item) => <Link key={item.href} href={item.href} className="nav-item"><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> IA activa<div className="tenant-name">Clínica piloto</div></div>
      </aside>
      <main className="main-content"><header className="topbar"><div><span className="eyebrow">Espacio de trabajo</span><strong>Clínica piloto</strong></div><div className="avatar" aria-label="Perfil de usuario">CP</div></header>{children}</main>
    </div>
  );
}
