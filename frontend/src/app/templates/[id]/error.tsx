'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Error boundary for the template edit page.
 * Catches errors when loading or editing a template.
 */
export default function TemplateEditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Template edit page error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Failed to load template" />;
}




