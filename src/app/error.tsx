'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-6 text-center">
      <span className="material-symbols-outlined text-error text-5xl">error</span>
      <div className="flex flex-col gap-2">
        <h2 className="text-on-surface text-xl font-semibold">Algo deu errado</h2>
        <p className="text-on-surface-variant text-sm max-w-sm">
          Ocorreu um erro inesperado. Tente novamente ou volte ao dashboard.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-secondary-container text-on-secondary-container text-sm font-medium"
        >
          Tentar novamente
        </button>
        
        <a  href="/dashboard"
          className="px-4 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-medium"
        >
          Ir ao dashboard
        </a>
      </div>
    </div>
  );
}