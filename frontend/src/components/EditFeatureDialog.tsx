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
import { useUpdateFeature } from '@/lib/queries';
import { ValidationAPIError, type Feature } from '@/lib/api';

interface EditFeatureDialogProps {
  feature: Feature;
  trigger: React.ReactNode;
}

export function EditFeatureDialog({ feature, trigger }: EditFeatureDialogProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<
    | { kind: 'simple'; message: string }
    | { kind: 'validation'; issues: string[]; suggestions: string[] }
    | null
  >(null);
  const [skipLlmValidation, setSkipLlmValidation] = useState(false);

  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description ?? '');
  const [rawRequirements, setRawRequirements] = useState(feature.raw_requirements);

  const updateMutation = useUpdateFeature();

  // Re-sync form on open so stale edits don't linger and external changes are
  // picked up (mirrors EditTestCaseDialog).
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTitle(feature.title);
      setDescription(feature.description ?? '');
      setRawRequirements(feature.raw_requirements);
      setError(null);
      setSkipLlmValidation(false);
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !rawRequirements.trim()) {
      setError({ kind: 'simple', message: 'Title and requirements are required' });
      return;
    }

    setError(null);
    // Capture and reset the bypass flag so it doesn't silently carry to future edits.
    const bypassLlm = skipLlmValidation;
    setSkipLlmValidation(false);

    try {
      await updateMutation.mutateAsync({
        id: feature.id,
        data: {
          title: title.trim(),
          description: description.trim() || null,
          raw_requirements: rawRequirements.trim(),
          skip_llm_validation: bypassLlm,
        },
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof ValidationAPIError) {
        setError({ kind: 'validation', issues: err.issues, suggestions: err.suggestions });
      } else {
        setSkipLlmValidation(false);
        setError({
          kind: 'simple',
          message: err instanceof Error ? err.message : 'Failed to update feature',
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-blue-400" />
            Edit Feature
          </DialogTitle>
          <DialogDescription>
            Update the feature title, description, or requirements. Editing
            requirements re-runs the validation gate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3 space-y-2">
              {error.kind === 'validation' ? (
                <>
                  <ul className="list-disc list-inside space-y-1">
                    {error.issues.map((issue, i) => (
                      <li key={i} className="text-sm text-destructive">{issue}</li>
                    ))}
                  </ul>
                  {error.suggestions.length > 0 && (
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {error.suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-1 border-t border-destructive/20">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={skipLlmValidation}
                        onChange={(e) => setSkipLlmValidation(e.target.checked)}
                        className="rounded border-destructive/50 accent-destructive"
                      />
                      <span className="text-sm text-muted-foreground">
                        Proceed anyway — skip AI quality check and save as-is
                      </span>
                    </label>
                  </div>
                </>
              ) : (
                <p className="text-sm text-destructive">{error.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-feature-title">Title *</Label>
            <Input
              id="edit-feature-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-feature-description">Description</Label>
            <Input
              id="edit-feature-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-feature-requirements">Requirements *</Label>
            <Textarea
              id="edit-feature-requirements"
              value={rawRequirements}
              onChange={(e) => setRawRequirements(e.target.value)}
              disabled={updateMutation.isPending}
              className="min-h-[160px] font-mono text-sm"
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
