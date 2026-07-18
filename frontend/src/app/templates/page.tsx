'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2, LayoutTemplate } from 'lucide-react';
import { useTemplates, useDeleteTemplate } from '@/lib/queries';
import type { Template } from '@/lib/api';

export default function TemplatesPage() {
  const { data: templates = [], isLoading, error } = useTemplates();
  const deleteMutation = useDeleteTemplate();
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;
    
    try {
      await deleteMutation.mutateAsync(templateToDelete.id);
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setTemplateToDelete(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">
            AI prompt templates that customize how test cases are generated.
          </p>
        </div>
        <Button asChild className="glow-teal">
          <Link href="/templates/new">
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Link>
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Failed to load templates</p>
          </CardContent>
        </Card>
      )}

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-1/2 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : error ? null : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <LayoutTemplate className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No templates yet</h2>
            <p className="text-muted-foreground text-center mb-6 max-w-sm">
              Create your first template to customize how the AI generates test cases for your features.
            </p>
            <Button asChild>
              <Link href="/templates/new">
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="card-hover group">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <Badge variant="outline">#{template.id}</Badge>
                </div>
                <CardDescription>System prompt for AI generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-32 rounded-lg bg-muted/50 p-3">
                  <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                    {template.system_instructions}
                  </pre>
                </ScrollArea>
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link href={`/templates/${template.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteClick(template)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{templateToDelete?.name}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
