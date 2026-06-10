import type { Metadata } from 'next';
import './globals.css'
import { Toaster } from 'sonner'
import { DarkModeProvider } from '@/components/darkmodeprovider';
import ConditionalLayout from '@/components/conditionallayout'

export const metadata: Metadata = {
  title: 'Controle de iPads',
  description: 'Sistema de controle de empréstimo de iPads',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface antialiased">
        <DarkModeProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                fontFamily: 'Inter, Arial, Helvetica, sans-serif',
                fontSize: '14px',
              },
            }}
            offset={{ bottom: 96 }}
            mobileOffset={{ bottom: 96 }}
          />
        </DarkModeProvider>
      </body>
    </html>
  );
}