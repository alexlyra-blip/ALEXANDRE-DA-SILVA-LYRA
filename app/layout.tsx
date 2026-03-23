import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Agent Portal - Portabilidade de Crédito',
  description: 'Credit portability simulation engine',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
              if (e.matches) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            });
          `
        }} />
      </head>
      <body className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col font-sans" suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
