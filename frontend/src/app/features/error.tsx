'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Error boundary for the features list page.
 * Catches errors when loading or displaying features.
 */
export default function FeaturesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Features page error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Failed to load features" />;
}




