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
import {
  Pencil,
  AlertTriangle,
  Zap,
  Loader2,
  Eye,
  Lightbulb,
  Link2,
  CheckCircle2,
  SkipForward,
} from 'lucide-react';
import { useTemplates, useCreateFeature, useGenerateTestCases } from '@/lib/queries';
import type { TestCaseDraft } from '@/lib/api';
import { ValidationAPIError } from '@/lib/api';
import { LinkManager } from '@/components/LinkManager';
import { NO_TEMPLATE_VALUE } from '@/lib/utils';

type Phase = 'form' | 'linking' | 'generated';

export default function NewFeaturePage() {
  const router = useRouter();
  const { data: templates = [] } = useTemplates();

  const createFeatureMutation = useCreateFeature();
  const generateTestCasesMutation = useGenerateTestCases();

  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<
    | { kind: 'simple'; message: string }
    | { kind: 'validation'; issues: string[]; suggestions: string[] }
    | null
  >(null);
  const [skipLlmValidation, setSkipLlmValidation] = useState(false);
  const [generatedCases, setGeneratedCases] = useState<TestCaseDraft[]>([]);
  const [createdFeatureId, setCreatedFeatureId] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Phase 1: create feature only (no generation yet)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !requirements.trim()) {
      setError({ kind: 'simple', message: 'Title and requirements are required' });
      return;
    }

    setError(null);

    try {
      const feature = await createFeatureMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        raw_requirements: requirements.trim(),
        skip_llm_validation: skipLlmValidation,
      });

      setCreatedFeatureId(feature.id);
      setPhase('linking');
    } catch (err) {
      if (err instanceof ValidationAPIError) {
        setError({ kind: 'validation', issues: err.issues, suggestions: err.suggestions });
      } else {
        setSkipLlmValidation(false);
        setError({
          kind: 'simple',
          message: err instanceof Error ? err.message : 'Failed to create feature',
        });
      }
    }
  };

  // Phase 2: generate test cases (with any linked context already saved)
  const handleGenerate = async () => {
    if (!createdFeatureId) return;

    setError(null);
    // Capture and reset the bypass flag so it doesn't silently carry to future attempts
    const bypassLlm = skipLlmValidation;
    setSkipLlmValidation(false);

    try {
      const response = await generateTestCasesMutation.mutateAsync({
        feature_id: createdFeatureId,
        template_id:
          selectedTemplateId && selectedTemplateId !== NO_TEMPLATE_VALUE
            ? parseInt(selectedTemplateId)
            : undefined,
        skip_llm_validation: bypassLlm,
      });

      setGeneratedCases(response.test_cases);
      setPhase('generated');
    } catch (err) {
      if (err instanceof ValidationAPIError) {
        setError({ kind: 'validation', issues: err.issues, suggestions: err.suggestions });
      } else {
        setError({
          kind: 'simple',
          message: err instanceof Error ? err.message : 'Failed to generate test cases',
        });
      }
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
          {phase === 'form' && 'Paste your requirements and let AI generate comprehensive test cases.'}
          {phase === 'linking' && 'Optionally link related features to give the AI more context before generating.'}
          {phase === 'generated' && 'Review the generated test cases and navigate to the feature to curate them.'}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            {error.kind === 'validation' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <p className="text-sm font-medium text-destructive">
                    Your requirements need some work before we can generate test cases.
                  </p>
                </div>
                <ul className="ml-7 list-disc list-inside space-y-1">
                  {error.issues.map((issue, i) => (
                    <li key={i} className="text-sm text-destructive">{issue}</li>
                  ))}
                </ul>
                {error.suggestions.length > 0 && (
                  <div className="ml-7 flex items-start gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <ul className="space-y-1">
                      {error.suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="ml-7 pt-1 border-t border-destructive/20">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={skipLlmValidation}
                      onChange={(e) => setSkipLlmValidation(e.target.checked)}
                      className="rounded border-destructive/50 accent-destructive"
                    />
                    <span className="text-sm text-muted-foreground">
                      Proceed anyway — skip AI quality check and submit as-is
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error.message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 1: Form */}
      {phase === 'form' && (
        <div className="grid gap-8 lg:grid-cols-2">
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
              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Feature Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., User Authentication"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={createFeatureMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of the feature"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={createFeatureMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template">Generation Template</Label>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={setSelectedTemplateId}
                    disabled={createFeatureMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEMPLATE_VALUE}>None (default prompt)</SelectItem>
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
                    disabled={createFeatureMutation.isPending}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full glow-teal"
                  disabled={createFeatureMutation.isPending || !title.trim() || !requirements.trim()}
                >
                  {createFeatureMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Feature...
                    </>
                  ) : (
                    <>
                      <Pencil className="w-4 h-4 mr-2" />
                      Create Feature
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Right panel: hint */}
          <div className="hidden lg:flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
            <Link2 className="w-16 h-16 opacity-20" />
            <div className="space-y-1">
              <p className="font-medium text-foreground/60">Link related features</p>
              <p className="text-sm max-w-xs">
                After creating your feature you&apos;ll get the chance to link related features as
                context before the AI generates test cases.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Link Context */}
      {phase === 'linking' && createdFeatureId !== null && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: feature summary + actions */}
          <div className="space-y-6">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">Feature created</p>
                    <p className="font-semibold truncate mt-0.5">{title}</p>
                    {description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{description}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <p>
                  Linked features provide additional context for the AI, resulting in more relevant
                  and accurate test cases.
                </p>
              </div>

              <Button
                className="w-full glow-teal"
                onClick={handleGenerate}
                disabled={generateTestCasesMutation.isPending}
              >
                {generateTestCasesMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating Test Cases...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Test Cases
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={handleGenerate}
                disabled={generateTestCasesMutation.isPending}
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Skip &amp; Generate
              </Button>
            </div>
          </div>

          {/* Right: LinkManager */}
          <LinkManager featureId={createdFeatureId} />
        </div>
      )}

      {/* Phase 3: Generated test cases preview */}
      {phase === 'generated' && createdFeatureId !== null && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: summary + navigate */}
          <div className="space-y-6">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary">Feature ready</p>
                    <p className="font-semibold truncate mt-0.5">{title}</p>
                    {description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{description}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button className="w-full" onClick={handleViewFeature}>
              <Eye className="w-4 h-4 mr-2" />
              View Feature &amp; Curate Test Cases
            </Button>
          </div>

          {/* Right: generated test cases */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Generated Test Cases</h2>
              {generatedCases.length > 0 && (
                <Badge variant="secondary" className="text-primary">
                  {generatedCases.length} cases
                </Badge>
              )}
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
