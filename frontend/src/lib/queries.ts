/**
 * React Query hooks for QA-Craft API
 *
 * These hooks provide data fetching, caching, and mutation functionality
 * with automatic cache invalidation and optimistic updates.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  featureApi,
  templateApi,
  generateApi,
  testCaseApi,
  refineApi,
  linksApi,
  type Feature,
  type Template,
  type TemplateCreate,
  type TemplateUpdate,
  type TestCase,
  type FeatureCreate,
  type TestCaseUpdate,
  type ManualTestCaseInput,
  type GenerateRequest,
  type GenerateResponse,
  type RefinementRequest,
  type RefinementResponse,
  type TestCaseFilters,
  type FeatureLinksResponse,
  type FeatureLinkCreate,
  type TestCaseLinkCreate,
  type FeatureLink,
  type TestCaseLink,
} from './api';

// ============== Query Keys ==============
// Centralized query keys for consistent cache management

export const queryKeys = {
  features: {
    all: ['features'] as const,
    detail: (id: number) => ['features', id] as const,
    testCases: (id: number, filters?: TestCaseFilters) => 
      filters && Object.values(filters).some(v => v != null)
        ? ['features', id, 'testCases', filters] as const
        : ['features', id, 'testCases'] as const,
    links: (id: number) => ['features', id, 'links'] as const,
  },
  templates: {
    all: ['templates'] as const,
    detail: (id: number) => ['templates', id] as const,
  },
  testCases: {
    detail: (id: number) => ['testCases', id] as const,
  },
};

// ============== Feature Queries ==============

export function useFeatures(
  options?: Omit<UseQueryOptions<Feature[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.features.all,
    queryFn: featureApi.list,
    ...options,
  });
}

export function useFeature(
  id: number,
  options?: Omit<UseQueryOptions<Feature, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.features.detail(id),
    queryFn: () => featureApi.get(id),
    enabled: id > 0,
    ...options,
  });
}

export function useFeatureTestCases(
  featureId: number,
  filters?: TestCaseFilters,
  options?: Omit<UseQueryOptions<TestCase[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.features.testCases(featureId, filters),
    queryFn: () => generateApi.getFeatureTestCases(featureId, filters),
    enabled: featureId > 0,
    // Keep showing the previous results while a new filter/search key loads, so
    // changing filters doesn't flip isLoading and unmount the page.
    placeholderData: keepPreviousData,
    ...options,
  });
}

// ============== Template Queries ==============

export function useTemplates(
  options?: Omit<UseQueryOptions<Template[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.templates.all,
    queryFn: templateApi.list,
    ...options,
  });
}

export function useTemplate(
  id: number,
  options?: Omit<UseQueryOptions<Template, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => templateApi.get(id),
    enabled: id > 0,
    ...options,
  });
}

// ============== Template Mutations ==============

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TemplateCreate) => templateApi.create(data),
    onSuccess: () => {
      // Invalidate and refetch templates list
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TemplateUpdate }) =>
      templateApi.update(id, data),
    onSuccess: (updatedTemplate) => {
      // Update the template in cache
      queryClient.setQueryData(
        queryKeys.templates.detail(updatedTemplate.id),
        updatedTemplate
      );
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => templateApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: queryKeys.templates.detail(deletedId),
      });
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

// ============== Feature Mutations ==============

export function useCreateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: FeatureCreate) => featureApi.create(data),
    onSuccess: () => {
      // Invalidate and refetch features list
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all });
    },
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<FeatureCreate> }) =>
      featureApi.update(id, data),
    onSuccess: (updatedFeature) => {
      // Update the feature in cache
      queryClient.setQueryData(
        queryKeys.features.detail(updatedFeature.id),
        updatedFeature
      );
      // Invalidate features list
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all });
    },
  });
}

export function useDeleteFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => featureApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({
        queryKey: queryKeys.features.detail(deletedId),
      });
      // Invalidate features list
      queryClient.invalidateQueries({ queryKey: queryKeys.features.all });
    },
  });
}

// ============== Test Case Mutations ==============

export function useCreateTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ManualTestCaseInput) => testCaseApi.create(data),
    onSuccess: (newTestCase) => {
      // Invalidate the feature's test cases
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(newTestCase.feature_id),
      });
    },
  });
}

export function useUpdateTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TestCaseUpdate }) =>
      testCaseApi.update(id, data),
    onSuccess: (updatedTestCase) => {
      // Update test case in cache
      queryClient.setQueryData(
        queryKeys.testCases.detail(updatedTestCase.id),
        updatedTestCase
      );
      // Invalidate the feature's test cases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(updatedTestCase.feature_id),
      });
    },
  });
}

export function useDeleteTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, featureId }: { id: number; featureId: number }) =>
      testCaseApi.delete(id).then(() => featureId),
    onSuccess: (featureId) => {
      // Invalidate the feature's test cases
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(featureId),
      });
    },
  });
}

export function useAcceptTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCaseApi.accept,
    onSuccess: (updatedTestCase) => {
      // Update test case in cache
      queryClient.setQueryData(
        queryKeys.testCases.detail(updatedTestCase.id),
        updatedTestCase
      );
      // Invalidate the feature's test cases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(updatedTestCase.feature_id),
      });
    },
  });
}

export function useRejectTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCaseApi.reject,
    onSuccess: (updatedTestCase) => {
      // Update test case in cache
      queryClient.setQueryData(
        queryKeys.testCases.detail(updatedTestCase.id),
        updatedTestCase
      );
      // Invalidate the feature's test cases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(updatedTestCase.feature_id),
      });
    },
  });
}

export function useResetTestCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: testCaseApi.reset,
    onSuccess: (updatedTestCase) => {
      // Update test case in cache
      queryClient.setQueryData(
        queryKeys.testCases.detail(updatedTestCase.id),
        updatedTestCase
      );
      // Invalidate the feature's test cases list
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(updatedTestCase.feature_id),
      });
    },
  });
}

// ============== Generation Mutations ==============

export function useGenerateTestCases() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: GenerateRequest): Promise<GenerateResponse> =>
      generateApi.generateTestCases(data),
    onSuccess: (_, variables) => {
      // Invalidate the feature's test cases after generation
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(variables.feature_id),
      });
      // Also refresh the feature itself so the generation_count badge updates (M14).
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.detail(variables.feature_id),
      });
    },
  });
}

// ============== Refinement Mutations ==============

export function useRefineTestSuite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RefinementRequest): Promise<RefinementResponse> =>
      refineApi.refineTestSuite(data),
    onSuccess: (response, variables) => {
      // Update the test cases in cache with the refined results
      queryClient.setQueryData(
        queryKeys.features.testCases(variables.feature_id),
        response.test_cases
      );
      // Invalidate to ensure we get fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.testCases(variables.feature_id),
      });
      // Refresh the feature so the refinement_count badge and the ≥3-refinement
      // warning reflect the increment (M14).
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.detail(variables.feature_id),
      });
    },
  });
}

// ============== Combined Queries for Dashboard ==============

export function useDashboardData() {
  const featuresQuery = useFeatures();
  const templatesQuery = useTemplates();

  return {
    features: featuresQuery.data ?? [],
    templates: templatesQuery.data ?? [],
    isLoading: featuresQuery.isLoading || templatesQuery.isLoading,
    error: featuresQuery.error || templatesQuery.error,
    isError: featuresQuery.isError || templatesQuery.isError,
  };
}

// ============== Combined Queries for Feature Detail ==============

export function useFeatureDetail(featureId: number, filters?: TestCaseFilters) {
  const featureQuery = useFeature(featureId);
  const testCasesQuery = useFeatureTestCases(featureId, filters);

  return {
    feature: featureQuery.data,
    testCases: testCasesQuery.data ?? [],
    isLoading: featureQuery.isLoading || testCasesQuery.isLoading,
    error: featureQuery.error || testCasesQuery.error,
    isError: featureQuery.isError || testCasesQuery.isError,
    refetch: () => {
      featureQuery.refetch();
      testCasesQuery.refetch();
    },
  };
}

// ============== Link Queries ==============

export function useFeatureLinks(
  featureId: number,
  options?: Omit<UseQueryOptions<FeatureLinksResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.features.links(featureId),
    queryFn: () => linksApi.getLinks(featureId),
    enabled: featureId > 0,
    ...options,
  });
}

// ============== Link Mutations ==============

export function useCreateFeatureLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, data }: { featureId: number; data: FeatureLinkCreate }): Promise<FeatureLink> =>
      linksApi.createFeatureLink(featureId, data),
    onSuccess: (_, variables) => {
      // Invalidate links for both source and target features
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.featureId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.data.target_feature_id),
      });
    },
  });
}

export function useDeleteFeatureLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, linkId, targetFeatureId }: { featureId: number; linkId: number; targetFeatureId: number }): Promise<void> =>
      linksApi.deleteFeatureLink(featureId, linkId),
    onSuccess: (_, variables) => {
      // Invalidate links for both features
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.featureId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.targetFeatureId),
      });
    },
  });
}

export function useCreateTestCaseLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, data }: { featureId: number; data: TestCaseLinkCreate }): Promise<TestCaseLink> =>
      linksApi.createTestCaseLink(featureId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.featureId),
      });
    },
  });
}

export function useDeleteTestCaseLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, linkId }: { featureId: number; linkId: number }): Promise<void> =>
      linksApi.deleteTestCaseLink(featureId, linkId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.features.links(variables.featureId),
      });
    },
  });
}

