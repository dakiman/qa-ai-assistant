'use client';

import { useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
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
import { useUpdateTestCase } from '@/lib/queries';
import type { TestCase } from '@/lib/api';

interface EditTestCaseDialogProps {
  testCase: TestCase;
  trigger: React.ReactNode;
}

export function EditTestCaseDialog({ testCase, trigger }: EditTestCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(testCase.title);
  const [stepsText, setStepsText] = useState(testCase.steps.join('\n'));
  const [expectedResult, setExpectedResult] = useState(testCase.expected_result);

  const updateMutation = useUpdateTestCase();

  // Re-sync form on open so stale edits don't linger and external changes
  // to the test case are picked up. Resetting in onOpenChange (not useEffect)
  // keeps this event-driven and avoids cascading renders.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTitle(testCase.title);
      setStepsText(testCase.steps.join('\n'));
      setExpectedResult(testCase.expected_result);
      setError(null);
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !stepsText.trim() || !expectedResult.trim()) {
      setError('All fields are required');
      return;
    }

    const steps = stepsText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (steps.length === 0) {
      setError('At least one step is required');
      return;
    }

    setError(null);

    try {
      await updateMutation.mutateAsync({
        id: testCase.id,
        data: {
          title: title.trim(),
          steps,
          expected_result: expectedResult.trim(),
        },
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update test case');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-400" />
            Edit Test Case
          </DialogTitle>
          <DialogDescription>
            Update the title, steps, or expected result. Status (accept / reject / reset) is managed from the card.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-tc-title">Test Case Title *</Label>
            <Input
              id="edit-tc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tc-steps">Steps (one per line) *</Label>
            <Textarea
              id="edit-tc-steps"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              disabled={updateMutation.isPending}
              className="min-h-[120px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Enter each step on a new line. Steps will be numbered automatically.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tc-expected">Expected Result *</Label>
            <Textarea
              id="edit-tc-expected"
              value={expectedResult}
              onChange={(e) => setExpectedResult(e.target.value)}
              disabled={updateMutation.isPending}
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
