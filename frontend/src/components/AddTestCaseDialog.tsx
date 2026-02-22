'use client';

import { useState } from 'react';
import { Plus, ClipboardCheck, Loader2 } from 'lucide-react';
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
import { useCreateTestCase } from '@/lib/queries';

interface AddTestCaseDialogProps {
  featureId: number;
  onTestCaseAdded: () => void;
  trigger?: React.ReactNode;
}

export function AddTestCaseDialog({ featureId, onTestCaseAdded, trigger }: AddTestCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [expectedResult, setExpectedResult] = useState('');

  // Mutation
  const createMutation = useCreateTestCase();

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

    setError(null);

    try {
      await createMutation.mutateAsync({
        feature_id: featureId,
        title: title.trim(),
        steps,
        expected_result: expectedResult.trim(),
        is_edge_case: false,
        is_manual: true,
      });

      onTestCaseAdded();
      resetForm();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test case');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Manual Case
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-400" />
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
              disabled={createMutation.isPending}
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
              disabled={createMutation.isPending}
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
              disabled={createMutation.isPending}
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
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
