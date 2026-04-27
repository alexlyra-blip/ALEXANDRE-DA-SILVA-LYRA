'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global Error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-white text-slate-900 p-4">
          <h2 className="text-2xl font-bold mb-4">Erro fatal.</h2>
          <button
            onClick={() => reset()}
            className="bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            Tentar Novamente
          </button>
        </div>
      </body>
    </html>
  );
}
