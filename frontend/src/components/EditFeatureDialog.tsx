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
  const [error, setError] = useState<string | null>(null);

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
    }
    setOpen(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !rawRequirements.trim()) {
      setError('Title and requirements are required');
      return;
    }

    setError(null);

    try {
      await updateMutation.mutateAsync({
        id: feature.id,
        data: {
          title: title.trim(),
          description: description.trim() || null,
          raw_requirements: rawRequirements.trim(),
        },
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof ValidationAPIError) {
        setError(err.issues.join(' '));
      } else {
        setError(err instanceof Error ? err.message : 'Failed to update feature');
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
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
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
