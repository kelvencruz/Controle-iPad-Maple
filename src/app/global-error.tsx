'use client';

import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                var s = localStorage.getItem('theme');
                var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (s === 'dark' || (!s && d)) document.documentElement.classList.add('dark');
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-on-surface flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4 m-0">
        <span className="material-symbols-outlined text-error text-5xl">error</span>
        <h2 className="text-xl font-semibold">Erro crítico na aplicação</h2>
        <p className="text-sm text-on-surface-variant max-w-sm">
          Um erro inesperado ocorreu. Recarregue a página ou entre em contato com o suporte.
        </p>
        {error?.digest && (
          <p className="text-xs text-on-surface-variant font-mono">
            código: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-medium cursor-pointer border-none"
        >
          Recarregar
        </button>
      </body>
    </html>
  );
}