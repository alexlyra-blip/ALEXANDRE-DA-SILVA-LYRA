import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { Providers } from '@/components/Providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ChatAssistant from '@/components/ChatAssistant';

export const metadata: Metadata = {
  title: 'Agent Portal - Portabilidade de Crédito',
  description: 'Credit portability simulation engine',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground min-h-screen flex flex-col font-sans" suppressHydrationWarning>
        <ErrorBoundary>
          <Providers>
            {children}
            <ChatAssistant />
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
