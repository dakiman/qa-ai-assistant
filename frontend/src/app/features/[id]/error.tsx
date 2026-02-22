'use client';

import { useEffect } from 'react';
import { ErrorCard } from '@/components/ErrorBoundary';

/**
 * Error boundary for the feature detail page.
 * Catches errors when loading or displaying a specific feature.
 */
export default function FeatureDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Feature detail error:', error);
  }, [error]);

  return <ErrorCard error={error} reset={reset} title="Failed to load feature" />;
}




