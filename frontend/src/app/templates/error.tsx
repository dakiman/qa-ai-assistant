'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Error boundary for the templates page.
 * Catches errors when loading or displaying templates.
 */
export default function TemplatesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Templates page error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Failed to load templates" />;
}




