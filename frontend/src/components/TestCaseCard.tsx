'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { type TestCase, testCaseApi } from '@/lib/api';

interface TestCaseCardProps {
  testCase: TestCase;
  onStatusChange?: (testCase: TestCase) => void;
  onDelete?: (id: number) => void;
}

export function TestCaseCard({ testCase, onStatusChange, onDelete }: TestCaseCardProps) {
  const [loading, setLoading] = useState(false);
  const [currentCase, setCurrentCase] = useState(testCase);

  const handleAccept = async () => {
    setLoading(true);
    try {
      const updated = await testCaseApi.accept(currentCase.id);
      setCurrentCase(updated);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to accept test case:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const updated = await testCaseApi.reject(currentCase.id);
      setCurrentCase(updated);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to reject test case:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const updated = await testCaseApi.reset(currentCase.id);
      setCurrentCase(updated);
      onStatusChange?.(updated);
    } catch (error) {
      console.error('Failed to reset test case:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAccepted = currentCase.status === 'accepted';
  const isRejected = currentCase.status === 'rejected';
  const isDraft = currentCase.status === 'draft';

  return (
    <Card
      className={cn(
        'card-hover transition-all duration-300',
        // Status-based styling
        isRejected && 'opacity-50 grayscale',
        isAccepted && 'ring-2 ring-green-500/50',
        // Edge case glow
        currentCase.is_edge_case && !isRejected && 'edge-case-glow',
        // Manual case indicator
        currentCase.is_manual && 'border-l-4 border-l-blue-500'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium line-clamp-2">
            {currentCase.title}
          </CardTitle>
          <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Edge Case Badge with sparkle icon */}
            {currentCase.is_edge_case && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Edge
              </Badge>
            )}
            {/* Manual Badge */}
            {currentCase.is_manual && (
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
              {currentCase.status.charAt(0).toUpperCase() + currentCase.status.slice(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Refinement Notes (if present) */}
        {currentCase.refinement_notes && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              AI Refinement Note
            </div>
            <p className="text-xs text-amber-200/80">{currentCase.refinement_notes}</p>
          </div>
        )}

        {/* Steps */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Steps:</p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            {currentCase.steps.map((step, index) => (
              <li key={index} className="text-foreground/80">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Expected Result */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Expected Result:</p>
          <p className="text-sm text-foreground/80">{currentCase.expected_result}</p>
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
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
                onClick={handleReject}
                disabled={loading}
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset to Draft
            </Button>
          )}
          
          <Button size="sm" variant="ghost" className="shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

