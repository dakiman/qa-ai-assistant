'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pencil, AlertTriangle, Zap, Loader2, Eye, Lightbulb } from 'lucide-react';
import { useTemplates, useCreateFeature, useGenerateTestCases } from '@/lib/queries';
import type { TestCaseDraft } from '@/lib/api';

export default function NewFeaturePage() {
  const router = useRouter();
  const { data: templates = [] } = useTemplates();
  
  // Mutations
  const createFeatureMutation = useCreateFeature();
  const generateTestCasesMutation = useGenerateTestCases();
  
  const [error, setError] = useState<string | null>(null);
  const [generatedCases, setGeneratedCases] = useState<TestCaseDraft[]>([]);
  const [createdFeatureId, setCreatedFeatureId] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const isLoading = createFeatureMutation.isPending || generateTestCasesMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !requirements.trim()) {
      setError('Title and requirements are required');
      return;
    }

    setError(null);

    try {
      // Create the feature
      const feature = await createFeatureMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        raw_requirements: requirements.trim(),
      });

      setCreatedFeatureId(feature.id);

      // Generate test cases
      const response = await generateTestCasesMutation.mutateAsync({
        feature_id: feature.id,
        template_id: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
      });

      setGeneratedCases(response.test_cases);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feature');
    }
  };

  const handleViewFeature = () => {
    if (createdFeatureId) {
      router.push(`/features/${createdFeatureId}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Feature</h1>
        <p className="text-muted-foreground mt-1">
          Paste your requirements and let AI generate comprehensive test cases.
        </p>
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

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Feature Details
            </CardTitle>
            <CardDescription>
              Enter the feature information and requirements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Feature Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., User Authentication"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isLoading || generatedCases.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description of the feature"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isLoading || generatedCases.length > 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Generation Template</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={isLoading || generatedCases.length > 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Templates customize how AI generates test cases
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements *</Label>
                <Textarea
                  id="requirements"
                  placeholder={`Paste your requirements here...

Example:
- Users should be able to log in with email and password
- Password must be at least 8 characters
- Show error message for invalid credentials
- Lock account after 5 failed attempts`}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={isLoading || generatedCases.length > 0}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              {generatedCases.length === 0 ? (
                <Button
                  type="submit"
                  className="w-full glow-teal"
                  disabled={isLoading || !title.trim() || !requirements.trim()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {generateTestCasesMutation.isPending ? 'Generating Test Cases...' : 'Creating Feature...'}
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Generate Test Cases
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleViewFeature}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Feature & Curate Test Cases
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Generated Test Cases Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Generated Test Cases</h2>
            {generatedCases.length > 0 && (
              <Badge variant="secondary" className="text-primary">
                {generatedCases.length} cases
              </Badge>
            )}
          </div>

          {generatedCases.length === 0 ? (
            <Card className="border-dashed h-[400px] flex items-center justify-center">
              <CardContent className="text-center">
                <Lightbulb className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Test cases will appear here after generation
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {generatedCases.map((testCase, index) => (
                <Card
                  key={index}
                  className={`card-hover ${testCase.is_edge_case ? 'edge-case-glow' : ''}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium">
                        {testCase.title}
                      </CardTitle>
                      <div className="flex gap-2 shrink-0">
                        {testCase.is_edge_case && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40">
                            Edge Case
                          </Badge>
                        )}
                        <Badge className="status-draft">Draft</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Steps:</p>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        {testCase.steps.map((step, stepIndex) => (
                          <li key={stepIndex} className="text-foreground/80">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Expected Result:</p>
                      <p className="text-sm text-foreground/80">{testCase.expected_result}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
