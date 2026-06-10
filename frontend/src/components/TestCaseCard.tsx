'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Check, X, RotateCcw, Pencil, Sparkles, Info } from 'lucide-react';
import { useAcceptTestCase, useRejectTestCase, useResetTestCase } from '@/lib/queries';
import type { TestCase } from '@/lib/api';
import { EditTestCaseDialog } from './EditTestCaseDialog';

interface TestCaseCardProps {
  testCase: TestCase;
  onStatusChange?: (testCase: TestCase) => void;
  onDelete?: (id: number) => void;
}

export function TestCaseCard({ testCase, onStatusChange }: TestCaseCardProps) {
  // Mutations
  const acceptMutation = useAcceptTestCase();
  const rejectMutation = useRejectTestCase();
  const resetMutation = useResetTestCase();

  const loading = acceptMutation.isPending || rejectMutation.isPending || resetMutation.isPending;

  const handleAccept = async () => {
    try {
      const updated = await acceptMutation.mutateAsync(testCase.id);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to accept test case:', error);
    }
  };

  const handleReject = async () => {
    try {
      const updated = await rejectMutation.mutateAsync(testCase.id);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to reject test case:', error);
    }
  };

  const handleReset = async () => {
    try {
      const updated = await resetMutation.mutateAsync(testCase.id);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to reset test case:', error);
    }
  };

  const isAccepted = testCase.status === 'accepted';
  const isRejected = testCase.status === 'rejected';
  const isDraft = testCase.status === 'draft';

  return (
    <Card
      className={cn(
        'card-hover transition-all duration-300',
        // Status-based styling
        isRejected && 'opacity-50 grayscale',
        isAccepted && 'ring-2 ring-green-500/50',
        // Edge case glow
        testCase.is_edge_case && !isRejected && 'edge-case-glow',
        // Manual case indicator
        testCase.is_manual && 'border-l-4 border-l-blue-500'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium line-clamp-2">
            {testCase.title}
          </CardTitle>
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Edge Case Badge with sparkle icon */}
            {testCase.is_edge_case && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 gap-1">
                <Sparkles className="w-3 h-3" />
                Edge
              </Badge>
            )}
            {/* Manual Badge */}
            {testCase.is_manual && (
              <Badge variant="outline" className="text-blue-400 border-blue-400/50">
                Manual
              </Badge>
            )}
            {/* Status Badge */}
            <Badge
              className={cn(
                isAccepted && 'status-accepted',
                isRejected && 'status-rejected',
                isDraft && 'status-draft'
              )}
            >
              {testCase.status.charAt(0).toUpperCase() + testCase.status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Refinement Notes (if present) */}
        {testCase.refinement_notes && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-1">
              <Info className="w-4 h-4" />
              AI Refinement Note
            </div>
            <p className="text-xs text-amber-200/80">{testCase.refinement_notes}</p>
          </div>
        )}

        {/* Steps */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Steps:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {testCase.steps.map((step, index) => (
              <li key={index} className="text-foreground/80">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Expected Result */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Expected Result:</p>
          <p className="text-sm text-foreground/80">{testCase.expected_result}</p>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isDraft && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-green-400 hover:text-green-300 hover:bg-green-500/10 border-green-500/30"
                onClick={handleAccept}
                disabled={loading}
              >
                <Check className="w-4 h-4 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
                onClick={handleReject}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </>
          )}
          
          {(isAccepted || isRejected) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={handleReset}
              disabled={loading}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset to Draft
            </Button>
          )}
          
          <EditTestCaseDialog
            testCase={testCase}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                aria-label="Edit test case"
                disabled={loading}
              >
                <Pencil className="w-4 h-4" />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
