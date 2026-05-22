'use client';

import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          fontWeight: 600,
          fontSize: '0.875rem',
          borderRadius: '0.75rem',
          border: '1px solid #334155',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
        },
        success: {
          iconTheme: { primary: '#10b981', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#f43f5e', secondary: '#fff' },
        },
      }}
    />
  );
}
