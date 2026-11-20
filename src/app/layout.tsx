import './globals.css';

export const metadata = { title: 'Clínica OS', description: 'Panel operativo para tu clínica' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
