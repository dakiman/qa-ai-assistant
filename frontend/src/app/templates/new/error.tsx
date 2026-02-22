'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Error boundary for the new template page.
 * Catches errors when creating a template.
 */
export default function NewTemplateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('New template page error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Failed to create template" />;
}




