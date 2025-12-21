'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { testCaseApi, type TestCase } from '@/lib/api';

interface AddTestCaseDialogProps {
  featureId: number;
  onTestCaseAdded: (testCase: TestCase) => void;
  trigger?: React.ReactNode;
}

export function AddTestCaseDialog({ featureId, onTestCaseAdded, trigger }: AddTestCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [expectedResult, setExpectedResult] = useState('');

  const resetForm = () => {
    setTitle('');
    setStepsText('');
    setExpectedResult('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !stepsText.trim() || !expectedResult.trim()) {
      setError('All fields are required');
      return;
    }

    // Parse steps (split by newlines, filter empty lines)
    const steps = stepsText
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (steps.length === 0) {
      setError('At least one step is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newTestCase = await testCaseApi.create({
        feature_id: featureId,
        title: title.trim(),
        steps,
        expected_result: expectedResult.trim(),
        is_edge_case: false,
        is_manual: true,
      });

      onTestCaseAdded(newTestCase);
      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test case');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Manual Case
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Add Manual Test Case
          </DialogTitle>
          <DialogDescription>
            Create a custom test case based on your domain knowledge. Manual cases are automatically accepted and included in refinement.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Test Case Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Verify password reset email is sent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="steps">Steps (one per line) *</Label>
            <Textarea
              id="steps"
              placeholder={`Navigate to the forgot password page
Enter a valid email address
Click the "Reset Password" button
Check the email inbox`}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              disabled={loading}
              className="min-h-[120px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter each step on a new line. Steps will be numbered automatically.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expected">Expected Result *</Label>
            <Textarea
              id="expected"
              placeholder="User receives a password reset email within 5 minutes containing a valid reset link"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              disabled={loading}
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Test Case
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

