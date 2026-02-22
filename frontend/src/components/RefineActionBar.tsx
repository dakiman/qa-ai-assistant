'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';
import { useRefineTestSuite } from '@/lib/queries';
import type { TestCase, RefinementResponse } from '@/lib/api';

// #region agent log
function _dbgLog(location: string, message: string, data?: Record<string, unknown>) {
  fetch('http://127.0.0.1:7242/ingest/c34574de-c7ef-4bd6-a6bf-37938fd4e65a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a8936c'},body:JSON.stringify({sessionId:'a8936c',location,message,data:data||{},timestamp:Date.now()})}).catch(()=>{});
}
// #endregion

interface RefineActionBarProps {
  featureId: number;
  testCases: TestCase[];
  onRefinementComplete: (response: RefinementResponse) => void;
}

export function RefineActionBar({ featureId, testCases, onRefinementComplete }: RefineActionBarProps) {
  const [error, setError] = useState<string | null>(null);
  
  // Mutation
  const refineMutation = useRefineTestSuite();
  
  // #region agent log
  useEffect(() => {
    _dbgLog('RefineActionBar', 'Mutation state changed', {
      isPending: refineMutation.isPending,
      isSuccess: refineMutation.isSuccess,
      isError: refineMutation.isError,
      hypothesisId: 'F'
    });
  }, [refineMutation.isPending, refineMutation.isSuccess, refineMutation.isError]);
  // #endregion

  // Count cases ready for refinement (accepted + manual)
  const readyCount = testCases.filter(
    tc => tc.status === 'accepted' || tc.is_manual
  ).length;

  const handleRefine = async () => {
    if (readyCount === 0) return;

    setError(null);
    
    // #region agent log
    _dbgLog('RefineActionBar:handleRefine', 'START', {featureId, hypothesisId: 'F'});
    // #endregion

    try {
      const response = await refineMutation.mutateAsync({
        feature_id: featureId,
      });
      
      // #region agent log
      _dbgLog('RefineActionBar:handleRefine', 'mutateAsync resolved', {testCasesCount: response.test_cases?.length, hypothesisId: 'F'});
      // #endregion
      
      onRefinementComplete(response);
      
      // #region agent log
      _dbgLog('RefineActionBar:handleRefine', 'onRefinementComplete called', {hypothesisId: 'F'});
      // #endregion
    } catch (err) {
      // #region agent log
      _dbgLog('RefineActionBar:handleRefine', 'ERROR', {error: String(err), hypothesisId: 'F'});
      // #endregion
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
          disabled={refineMutation.isPending || readyCount === 0}
          className="glow-teal"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Refine Suite
        </Button>
      </div>
    </>
  );
}
