'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Link2, 
  FileText, 
  Loader2,
  Check,
} from 'lucide-react';
import {
  useFeatures,
  useCreateFeatureLink,
  useCreateTestCaseLink,
  queryKeys,
} from '@/lib/queries';
import { generateApi } from '@/lib/api';
import { 
  LINK_TYPE_LABELS, 
  type FeatureLinkType,
  type Feature,
  type TestCase,
} from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

interface LinkSelectorDialogProps {
  featureId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LinkMode = 'feature' | 'test-case';

export function LinkSelectorDialog({ 
  featureId, 
  open, 
  onOpenChange 
}: LinkSelectorDialogProps) {
  const [mode, setMode] = useState<LinkMode>('feature');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLinkType, setSelectedLinkType] = useState<FeatureLinkType>('relates_to');
  const [selectedItem, setSelectedItem] = useState<Feature | TestCase | null>(null);
  const [selectedFeatureForTestCase, setSelectedFeatureForTestCase] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  
  const { data: features = [], isLoading: featuresLoading } = useFeatures();
  const createFeatureLink = useCreateFeatureLink();
  const createTestCaseLink = useCreateTestCaseLink();

  // Filter out the current feature
  const availableFeatures = useMemo(() => 
    features.filter(f => f.id !== featureId),
    [features, featureId]
  );

  // Filter features by search
  const filteredFeatures = useMemo(() => 
    availableFeatures.filter(f => 
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [availableFeatures, searchQuery]
  );

  // Fetch test cases for selected feature
  const { data: testCases = [], isLoading: testCasesLoading } = useQuery({
    // Derive from the shared factory (+ a 'forLinking' suffix) so this picker's
    // cache stays a distinct entry yet still shares the feature testCases prefix
    // for invalidation, instead of relying on an ad-hoc hand-built key.
    queryKey: [...queryKeys.features.testCases(selectedFeatureForTestCase ?? -1), 'forLinking'],
    queryFn: () => generateApi.getFeatureTestCases(selectedFeatureForTestCase!),
    enabled: mode === 'test-case' && selectedFeatureForTestCase !== null,
  });

  // Filter test cases by search
  const filteredTestCases = useMemo(() =>
    testCases.filter(tc =>
      tc.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [testCases, searchQuery]
  );

  const handleSubmit = async () => {
    if (!selectedItem) return;

    try {
      if (mode === 'feature') {
        await createFeatureLink.mutateAsync({
          featureId,
          data: {
            target_feature_id: (selectedItem as Feature).id,
            link_type: selectedLinkType,
            notes: notes || null,
          },
        });
      } else {
        await createTestCaseLink.mutateAsync({
          featureId,
          data: {
            test_case_id: (selectedItem as TestCase).id,
            notes: notes || null,
          },
        });
      }
      handleClose();
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedItem(null);
    setSelectedFeatureForTestCase(null);
    setNotes('');
    setSelectedLinkType('relates_to');
    onOpenChange(false);
  };

  const isSubmitting = createFeatureLink.isPending || createTestCaseLink.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Add Link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Mode Selector */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'feature' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('feature');
                setSelectedItem(null);
                setSearchQuery('');
              }}
            >
              <Link2 className="w-4 h-4 mr-1" />
              Link Feature
            </Button>
            <Button
              variant={mode === 'test-case' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMode('test-case');
                setSelectedItem(null);
                setSearchQuery('');
              }}
            >
              <FileText className="w-4 h-4 mr-1" />
              Link Test Case
            </Button>
          </div>

          {mode === 'feature' ? (
            <>
              {/* Link Type Selector */}
              <div className="space-y-2">
                <Label>Relationship Type</Label>
                <Select
                  value={selectedLinkType}
                  onValueChange={(v) => setSelectedLinkType(v as FeatureLinkType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LINK_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Feature Search */}
              <div className="space-y-2">
                <Label>Select Feature</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search features..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Feature List */}
              <ScrollArea className="flex-1 border rounded-lg">
                {featuresLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : filteredFeatures.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No features found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredFeatures.map((feature) => (
                      <FeatureItem
                        key={feature.id}
                        feature={feature}
                        isSelected={selectedItem?.id === feature.id}
                        onSelect={() => setSelectedItem(feature)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          ) : (
            <>
              {/* Feature Selector for Test Cases */}
              <div className="space-y-2">
                <Label>Select Feature (to pick test cases from)</Label>
                <Select
                  value={selectedFeatureForTestCase?.toString() ?? ''}
                  onValueChange={(v) => {
                    setSelectedFeatureForTestCase(parseInt(v));
                    setSelectedItem(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a feature..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFeatures.map((feature) => (
                      <SelectItem key={feature.id} value={feature.id.toString()}>
                        {feature.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedFeatureForTestCase && (
                <>
                  {/* Test Case Search */}
                  <div className="space-y-2">
                    <Label>Select Test Case</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search test cases..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Test Case List */}
                  <ScrollArea className="flex-1 border rounded-lg">
                    {testCasesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : filteredTestCases.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No test cases found
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {filteredTestCases.map((testCase) => (
                          <TestCaseItem
                            key={testCase.id}
                            testCase={testCase}
                            isSelected={selectedItem?.id === testCase.id}
                            onSelect={() => setSelectedItem(testCase)}
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
            </>
          )}

          {/* Notes Field */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="Why is this related? (helps with context)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!selectedItem || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Create Link
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FeatureItemProps {
  feature: Feature;
  isSelected: boolean;
  onSelect: () => void;
}

function FeatureItem({ feature, isSelected, onSelect }: FeatureItemProps) {
  return (
    <button
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected 
          ? 'bg-primary/10 border border-primary/50' 
          : 'hover:bg-muted/50 border border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{feature.title}</span>
            <Badge variant="outline" className="shrink-0">#{feature.id}</Badge>
          </div>
          {feature.description && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {feature.description}
            </p>
          )}
        </div>
        {isSelected && (
          <Check className="w-5 h-5 text-primary shrink-0 ml-2" />
        )}
      </div>
    </button>
  );
}

interface TestCaseItemProps {
  testCase: TestCase;
  isSelected: boolean;
  onSelect: () => void;
}

function TestCaseItem({ testCase, isSelected, onSelect }: TestCaseItemProps) {
  return (
    <button
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected 
          ? 'bg-primary/10 border border-primary/50' 
          : 'hover:bg-muted/50 border border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="font-medium truncate">{testCase.title}</span>
            {testCase.is_edge_case && (
              <Badge variant="secondary" className="shrink-0 text-xs">
                Edge Case
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {testCase.steps.join(' → ')}
          </p>
        </div>
        {isSelected && (
          <Check className="w-5 h-5 text-primary shrink-0 ml-2" />
        )}
      </div>
    </button>
  );
}



