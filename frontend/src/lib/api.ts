/**
 * API client for QA-Craft backend
 * 
 * Types are auto-generated from the backend OpenAPI spec.
 * Run `npm run generate-types` to update types.
 */

import type { components } from './api-types';

// Relative base by default so browser requests go through the Next.js proxy
// (src/app/api/v1/[...path]/route.ts), which injects the server-only API key.
// The write key is never shipped in the client bundle.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

/**
 * Get headers for API requests. Auth is added server-side by the proxy — do not
 * read a public API key here.
 */
function getHeaders(includeContentType = false): HeadersInit {
  const headers: HeadersInit = {};

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

// ============== Types (from OpenAPI) ==============
// These types are derived from the auto-generated api-types.ts

export type Feature = components['schemas']['FeatureRead'];
export type FeatureCreate = components['schemas']['FeatureCreate'] & {
  skip_llm_validation?: boolean;
};
export type FeatureUpdate = components['schemas']['FeatureUpdate'] & {
  skip_llm_validation?: boolean;
};

export type Template = components['schemas']['TemplateRead'];
export type TemplateCreate = components['schemas']['TemplateCreate'];
export type TemplateUpdate = components['schemas']['TemplateUpdate'];

export type TestCase = components['schemas']['TestCaseRead'];
export type TestCaseCreate = components['schemas']['TestCaseCreate'];
export type TestCaseUpdate = components['schemas']['TestCaseUpdate'];
export type TestCaseDraft = components['schemas']['TestCaseDraft'];
export type TestCaseStatus = components['schemas']['TestCaseStatus'];

/**
 * Input type for creating a manual test case.
 * Fields with backend defaults (is_edge_case, is_manual, status) are optional here
 * as they're handled by the API client.
 */
export interface ManualTestCaseInput {
  feature_id: number;
  title: string;
  steps: string[];
  expected_result: string;
  is_edge_case?: boolean;
  is_manual?: boolean;
  refinement_notes?: string | null;
}

export type GenerateRequest = components['schemas']['GenerateRequest'] & {
  skip_llm_validation?: boolean;
  target_count?: number;
  force_regenerate?: boolean;
};
export type GenerateResponse = components['schemas']['GenerateResponse'];

export type RefinementRequest = components['schemas']['RefinementRequest'];
export type RefinementResponse = components['schemas']['RefinementResponse'];

/**
 * Filter parameters for test case listing.
 */
export interface TestCaseFilters {
  status?: TestCaseStatus | null;
  is_edge_case?: boolean | null;
  is_manual?: boolean | null;
  search?: string | null;
}

// ============== Link Types ==============

export type FeatureLinkType = 
  | 'relates_to'
  | 'depends_on'
  | 'blocks'
  | 'parent_of'
  | 'child_of';

export interface FeatureLink {
  id: number;
  source_feature_id: number;
  target_feature_id: number;
  link_type: FeatureLinkType;
  notes: string | null;
  created_at: string;
  target_feature_title: string | null;
}

export interface FeatureLinkCreate {
  target_feature_id: number;
  link_type: FeatureLinkType;
  notes?: string | null;
}

export interface TestCaseLink {
  id: number;
  feature_id: number;
  test_case_id: number;
  notes: string | null;
  created_at: string;
  test_case_title: string | null;
  test_case_feature_id: number | null;
  test_case_feature_title: string | null;
}

export interface TestCaseLinkCreate {
  test_case_id: number;
  notes?: string | null;
}

export interface FeatureLinksResponse {
  feature_id: number;
  feature_links: FeatureLink[];
  test_case_links: TestCaseLink[];
}

/**
 * Human-readable display names for link types.
 */
export const LINK_TYPE_LABELS: Record<FeatureLinkType, string> = {
  relates_to: 'Relates To',
  depends_on: 'Depends On',
  blocks: 'Blocks',
  parent_of: 'Parent Of',
  child_of: 'Child Of',
};

// ============== API Error Handling ==============

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

export class ValidationAPIError extends Error {
  readonly name = 'ValidationAPIError';
  constructor(
    public readonly issues: string[],
    public readonly suggestions: string[],
  ) {
    super('Requirements validation failed');
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    if (
      response.status === 422 &&
      error.detail &&
      typeof error.detail === 'object' &&
      error.detail.type === 'requirements_validation_error'
    ) {
      throw new ValidationAPIError(error.detail.issues ?? [], error.detail.suggestions ?? []);
    }
    let message: string;
    if (typeof error.detail === 'string') {
      message = error.detail;
    } else if (Array.isArray(error.detail)) {
      // FastAPI validation errors are an array of {loc, msg, type}. Surface the
      // actual messages instead of a generic "Request failed" (L22).
      message =
        error.detail
          .map((d: { msg?: string }) => d?.msg)
          .filter(Boolean)
          .join('; ') || 'Request failed';
    } else {
      message = 'Request failed';
    }
    throw new APIError(response.status, message);
  }

  return response.json();
}

// ============== Feature API ==============

export const featureApi = {
  async list(): Promise<Feature[]> {
    const response = await fetch(`${API_BASE_URL}/features/`, {
      headers: getHeaders(),
    });
    return handleResponse<Feature[]>(response);
  },

  async get(id: number): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`, {
      headers: getHeaders(),
    });
    return handleResponse<Feature>(response);
  },

  async create(data: FeatureCreate): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Feature>(response);
  },

  async update(id: number, data: Partial<FeatureCreate>): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Feature>(response);
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete feature');
    }
  },

  async export(
    featureId: number,
    format: 'json' | 'csv',
    status?: TestCaseStatus,
  ): Promise<{ blob: Blob; filename: string }> {
    const params = new URLSearchParams();
    params.set('format', format);
    if (status) {
      params.set('status', status);
    }
    const response = await fetch(
      `${API_BASE_URL}/features/${featureId}/export?${params.toString()}`,
      { headers: getHeaders() },
    );
    if (!response.ok) {
      throw new APIError(response.status, 'Export failed');
    }
    // Prefer the server-provided filename (Content-Disposition), fall back to a
    // sensible default. Reachable now that the request is same-origin via the proxy.
    let filename = `feature_${featureId}_test_cases.${format}`;
    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = match[1];
      }
    }
    const blob = await response.blob();
    return { blob, filename };
  },
};

// ============== Health / connectivity ==============

export const healthApi = {
  /**
   * Cheap connectivity probe for the "API Connected" indicator. Hits the
   * features list with limit=1 through the proxy (same-origin) and reports
   * whether the backend answered ok.
   */
  async check(): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/features/?limit=1`, {
      headers: getHeaders(),
    });
    return response.ok;
  },
};

// ============== Template API ==============

export const templateApi = {
  async list(): Promise<Template[]> {
    const response = await fetch(`${API_BASE_URL}/templates/`, {
      headers: getHeaders(),
    });
    return handleResponse<Template[]>(response);
  },

  async get(id: number): Promise<Template> {
    const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
      headers: getHeaders(),
    });
    return handleResponse<Template>(response);
  },

  async create(data: TemplateCreate): Promise<Template> {
    const response = await fetch(`${API_BASE_URL}/templates/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Template>(response);
  },

  async update(id: number, data: TemplateUpdate): Promise<Template> {
    const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Template>(response);
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/templates/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete template');
    }
  },
};

// ============== Generation API ==============

export const generateApi = {
  async generateTestCases(data: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch(`${API_BASE_URL}/generate/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<GenerateResponse>(response);
  },

  async getFeatureTestCases(featureId: number, filters?: TestCaseFilters): Promise<TestCase[]> {
    const params = new URLSearchParams();
    
    if (filters?.status) {
      params.set('status', filters.status);
    }
    if (filters?.is_edge_case !== undefined && filters.is_edge_case !== null) {
      params.set('is_edge_case', String(filters.is_edge_case));
    }
    if (filters?.is_manual !== undefined && filters.is_manual !== null) {
      params.set('is_manual', String(filters.is_manual));
    }
    if (filters?.search) {
      params.set('search', filters.search);
    }
    
    const queryString = params.toString();
    const url = `${API_BASE_URL}/generate/feature/${featureId}/test-cases${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      headers: getHeaders(),
    });
    return handleResponse<TestCase[]>(response);
  },
};

// ============== Test Case API ==============

export const testCaseApi = {
  async create(data: ManualTestCaseInput): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({
        ...data,
        is_manual: true,
        is_edge_case: data.is_edge_case ?? false,
        status: 'accepted', // Manual cases are auto-accepted
      }),
    });
    return handleResponse<TestCase>(response);
  },

  async get(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`, {
      headers: getHeaders(),
    });
    return handleResponse<TestCase>(response);
  },

  async update(id: number, data: TestCaseUpdate): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<TestCase>(response);
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete test case');
    }
  },

  async accept(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/accept`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse<TestCase>(response);
  },

  async reject(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/reject`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse<TestCase>(response);
  },

  async reset(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/reset`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return handleResponse<TestCase>(response);
  },
};

// ============== Refinement API ==============

export const refineApi = {
  async refineTestSuite(data: RefinementRequest): Promise<RefinementResponse> {
    const response = await fetch(`${API_BASE_URL}/features/${data.feature_id}/refine`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<RefinementResponse>(response);
  },
};

// ============== Links API ==============

export const linksApi = {
  /**
   * Get all links for a feature (both feature links and test case links).
   */
  async getLinks(featureId: number): Promise<FeatureLinksResponse> {
    const response = await fetch(`${API_BASE_URL}/features/${featureId}/links`, {
      headers: getHeaders(),
    });
    return handleResponse<FeatureLinksResponse>(response);
  },

  /**
   * Create a feature-to-feature link.
   */
  async createFeatureLink(featureId: number, data: FeatureLinkCreate): Promise<FeatureLink> {
    const response = await fetch(`${API_BASE_URL}/features/${featureId}/links/feature`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<FeatureLink>(response);
  },

  /**
   * Delete a feature-to-feature link.
   */
  async deleteFeatureLink(featureId: number, linkId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/features/${featureId}/links/feature/${linkId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete feature link');
    }
  },

  /**
   * Create a feature-to-test-case link.
   */
  async createTestCaseLink(featureId: number, data: TestCaseLinkCreate): Promise<TestCaseLink> {
    const response = await fetch(`${API_BASE_URL}/features/${featureId}/links/test-case`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<TestCaseLink>(response);
  },

  /**
   * Delete a feature-to-test-case link.
   */
  async deleteTestCaseLink(featureId: number, linkId: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/features/${featureId}/links/test-case/${linkId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete test case link');
    }
  },
};
