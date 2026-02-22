'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Root error boundary for the application.
 * Catches errors in the main app layout and pages.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for debugging
    console.error('Application error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Application Error" />;
}




