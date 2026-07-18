'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { useRefineTestSuite } from '@/lib/queries';
import type { TestCase, RefinementResponse } from '@/lib/api';

const REFINEMENT_WARNING_THRESHOLD = 3;
const DEFAULT_MAX_NEW_CASES = 5;

interface RefineActionBarProps {
  featureId: number;
  testCases: TestCase[];
  refinementCount: number;
  onRefinementComplete: (response: RefinementResponse) => void;
}

export function RefineActionBar({ featureId, testCases, refinementCount, onRefinementComplete }: RefineActionBarProps) {
  const [error, setError] = useState<string | null>(null);
  const [maxNewCases, setMaxNewCases] = useState(DEFAULT_MAX_NEW_CASES);

  // Mutation
  const refineMutation = useRefineTestSuite();

  // Count cases ready for refinement (accepted + manual)
  const readyCount = testCases.filter(
    tc => tc.status === 'accepted' || tc.is_manual
  ).length;

  // Derive directly from the prop. After a refine, the mutation invalidates the
  // feature detail query, the parent refetches, and this prop updates — copying
  // it into state (the old approach) went stale on navigate-away/back (M15).
  const showWarning = refinementCount >= REFINEMENT_WARNING_THRESHOLD;

  const handleRefine = async () => {
    if (readyCount === 0 || maxNewCases < 1 || maxNewCases > 15) return;

    setError(null);

    try {
      const response = await refineMutation.mutateAsync({
        feature_id: featureId,
        max_new_cases: maxNewCases,
      });
      onRefinementComplete(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refinement failed');
    }
  };

  // Don't show if no cases are ready
  if (readyCount === 0 && !refineMutation.isPending) {
    return null;
  }

  return (
    <>
      {/* Refining Overlay */}
      {refineMutation.isPending && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin mx-auto" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
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
        'fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40',
        'max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-2xl shadow-black/50',
        'px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4',
        'animate-in slide-in-from-bottom-4 duration-300'
      )}>
        {error && (
          <div className="text-sm text-destructive">
            {error}
          </div>
        )}

        {showWarning && (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Consider reviewing before refining further</span>
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
          {refinementCount > 0 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Refinement {refinementCount}
            </Badge>
          )}
        </div>

        <div className="hidden sm:block h-8 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Label htmlFor="max-new-cases" className="text-sm text-muted-foreground whitespace-nowrap">
            New cases (1–15)
          </Label>
          <Input
            id="max-new-cases"
            type="number"
            min={1}
            max={15}
            value={maxNewCases}
            onChange={(e) => setMaxNewCases(Number(e.target.value))}
            disabled={refineMutation.isPending}
            className="w-20"
          />
        </div>

        <Button
          onClick={handleRefine}
          disabled={
            refineMutation.isPending ||
            readyCount === 0 ||
            maxNewCases < 1 ||
            maxNewCases > 15
          }
          className="glow-teal"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Refine Suite
        </Button>
      </div>
    </>
  );
}
