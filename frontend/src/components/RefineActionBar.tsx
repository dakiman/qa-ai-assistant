'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { refineApi, type TestCase, type RefinementResponse } from '@/lib/api';

interface RefineActionBarProps {
  featureId: number;
  testCases: TestCase[];
  onRefinementComplete: (response: RefinementResponse) => void;
}

export function RefineActionBar({ featureId, testCases, onRefinementComplete }: RefineActionBarProps) {
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count cases ready for refinement (accepted + manual)
  const readyCount = testCases.filter(
    tc => tc.status === 'accepted' || tc.is_manual
  ).length;

  const handleRefine = async () => {
    if (readyCount === 0) return;

    setRefining(true);
    setError(null);

    try {
      const response = await refineApi.refineTestSuite({
        feature_id: featureId,
      });
      onRefinementComplete(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refinement failed');
    } finally {
      setRefining(false);
    }
  };

  // Don't show if no cases are ready
  if (readyCount === 0 && !refining) {
    return null;
  }

  return (
    <>
      {/* Refining Overlay */}
      {refining && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">AI is hunting for edge cases...</h3>
              <p className="text-muted-foreground mt-1">
                Analyzing requirements and finding gaps in your test coverage
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Bar */}
      <div className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-40',
        'bg-card border border-border rounded-2xl shadow-2xl shadow-black/50',
        'px-6 py-4 flex items-center gap-4',
        'animate-in slide-in-from-bottom-4 duration-300'
      )}>
        {error && (
          <div className="text-sm text-destructive">
            {error}
          </div>
        )}
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">
              Ready for refinement:
            </span>
            <Badge variant="secondary" className="text-primary font-semibold">
              {readyCount} cases
            </Badge>
          </div>
        </div>

        <div className="h-8 w-px bg-border" />

        <Button
          onClick={handleRefine}
          disabled={refining || readyCount === 0}
          className="glow-teal"
        >
          <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Refine Suite
        </Button>
      </div>
    </>
  );
}

