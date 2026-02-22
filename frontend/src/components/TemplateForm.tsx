'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LayoutTemplate, AlertTriangle, Loader2, ArrowLeft, Eye, Save } from 'lucide-react';
import { useCreateTemplate, useUpdateTemplate } from '@/lib/queries';
import type { Template, TemplateCreate } from '@/lib/api';

interface TemplateFormProps {
  /** Existing template for edit mode, undefined for create mode */
  template?: Template;
  /** Mode determines UI labels and behavior */
  mode: 'create' | 'edit';
}

export function TemplateForm({ template, mode }: TemplateFormProps) {
  const router = useRouter();
  
  // Mutations
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState(template?.name ?? '');
  const [systemInstructions, setSystemInstructions] = useState(template?.system_instructions ?? '');

  // Reset form when template changes (for edit mode)
  useEffect(() => {
    if (template) {
      setName(template.name);
      setSystemInstructions(template.system_instructions);
    }
  }, [template]);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemInstructions.trim()) {
      setError('Name and system instructions are required');
      return;
    }

    setError(null);

    const data: TemplateCreate = {
      name: name.trim(),
      system_instructions: systemInstructions.trim(),
    };

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync(data);
        setSuccess(true);
        setTimeout(() => router.push('/templates'), 1000);
      } else if (template) {
        await updateMutation.mutateAsync({ id: template.id, data });
        setSuccess(true);
        setTimeout(() => router.push('/templates'), 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    }
  };

  const handleBack = () => {
    router.push('/templates');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mode === 'create' ? 'Create New Template' : 'Edit Template'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {mode === 'create'
              ? 'Create a custom AI prompt template for test case generation.'
              : 'Modify the template settings and system instructions.'}
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success Alert */}
      {success && (
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="pt-6">
            <p className="text-sm text-green-400">
              Template {mode === 'create' ? 'created' : 'updated'} successfully! Redirecting...
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-primary" />
              Template Details
            </CardTitle>
            <CardDescription>
              Configure the template name and AI system instructions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Security Testing Template"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading || success}
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name to identify this template
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instructions">System Instructions *</Label>
                <Textarea
                  id="instructions"
                  placeholder={`Enter the system prompt for the AI...

Example:
You are a senior QA engineer specializing in security testing. 
When generating test cases:
- Focus on authentication and authorization scenarios
- Include SQL injection and XSS attack vectors
- Test for data validation and input sanitization
- Consider session management vulnerabilities`}
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                  disabled={isLoading || success}
                  className="min-h-[300px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  These instructions will be sent to the AI when generating test cases
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 glow-teal"
                  disabled={isLoading || !name.trim() || !systemInstructions.trim() || success}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {mode === 'create' ? 'Creating...' : 'Saving...'}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {mode === 'create' ? 'Create Template' : 'Save Changes'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Preview Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-muted-foreground" />
              Preview
            </CardTitle>
            <CardDescription>
              How your template will appear
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Template Name</p>
                <p className="text-lg font-semibold">
                  {name.trim() || <span className="text-muted-foreground italic">Untitled Template</span>}
                </p>
              </div>
              
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">System Instructions</p>
                <ScrollArea className="h-[350px] rounded-lg bg-muted/50 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-muted-foreground">
                    {systemInstructions.trim() || 'No instructions provided yet...'}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}




