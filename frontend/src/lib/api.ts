/**
 * API client for QA-Craft backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ============== Types ==============

export interface Feature {
  id: number;
  title: string;
  description: string | null;
  raw_requirements: string;
  created_at: string;
}

export interface FeatureCreate {
  title: string;
  description?: string;
  raw_requirements: string;
}

export interface Template {
  id: number;
  name: string;
  system_instructions: string;
}

export interface TestCaseDraft {
  title: string;
  steps: string[];
  expected_result: string;
  is_edge_case: boolean;
  refinement_notes?: string | null;
}

export interface TestCase extends TestCaseDraft {
  id: number;
  feature_id: number;
  is_manual: boolean;
  status: 'draft' | 'accepted' | 'rejected';
}

export interface TestCaseCreate {
  title: string;
  steps: string[];
  expected_result: string;
  is_edge_case?: boolean;
  is_manual?: boolean;
  feature_id: number;
}

export interface TestCaseUpdate {
  title?: string;
  steps?: string[];
  expected_result?: string;
  is_edge_case?: boolean;
  status?: 'draft' | 'accepted' | 'rejected';
}

export interface GenerateRequest {
  feature_id: number;
  template_id?: number;
}

export interface GenerateResponse {
  feature_id: number;
  test_cases: TestCaseDraft[];
  message: string;
}

export interface RefinementRequest {
  feature_id: number;
  template_id?: number;
}

export interface RefinementResponse {
  feature_id: number;
  original_count: number;
  new_count: number;
  edge_cases_added: number;
  test_cases: TestCase[];
  message: string;
}

export interface FeatureStats {
  feature_id: number;
  total: number;
  draft: number;
  accepted: number;
  rejected: number;
  edge_cases: number;
  manual: number;
  ready_for_refinement: number;
}

// ============== API Error Handling ==============

class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new APIError(response.status, error.detail || 'Request failed');
  }
  return response.json();
}

// ============== Feature API ==============

export const featureApi = {
  async list(): Promise<Feature[]> {
    const response = await fetch(`${API_BASE_URL}/features/`);
    return handleResponse<Feature[]>(response);
  },

  async get(id: number): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`);
    return handleResponse<Feature>(response);
  },

  async create(data: FeatureCreate): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Feature>(response);
  },

  async update(id: number, data: Partial<FeatureCreate>): Promise<Feature> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Feature>(response);
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/features/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete feature');
    }
  },

  async getStats(id: number): Promise<FeatureStats> {
    const response = await fetch(`${API_BASE_URL}/features/${id}/stats`);
    return handleResponse<FeatureStats>(response);
  },
};

// ============== Template API ==============

export const templateApi = {
  async list(): Promise<Template[]> {
    const response = await fetch(`${API_BASE_URL}/templates/`);
    return handleResponse<Template[]>(response);
  },

  async get(id: number): Promise<Template> {
    const response = await fetch(`${API_BASE_URL}/templates/${id}`);
    return handleResponse<Template>(response);
  },
};

// ============== Generation API ==============

export const generateApi = {
  async generateTestCases(data: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch(`${API_BASE_URL}/generate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<GenerateResponse>(response);
  },

  async getFeatureTestCases(featureId: number): Promise<TestCase[]> {
    const response = await fetch(`${API_BASE_URL}/generate/feature/${featureId}/test-cases`);
    return handleResponse<TestCase[]>(response);
  },
};

// ============== Test Case API ==============

export const testCaseApi = {
  async create(data: TestCaseCreate): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        is_manual: true,
        status: 'accepted', // Manual cases are auto-accepted
      }),
    });
    return handleResponse<TestCase>(response);
  },

  async get(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`);
    return handleResponse<TestCase>(response);
  },

  async update(id: number, data: TestCaseUpdate): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<TestCase>(response);
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new APIError(response.status, 'Failed to delete test case');
    }
  },

  async accept(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/accept`, {
      method: 'POST',
    });
    return handleResponse<TestCase>(response);
  },

  async reject(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/reject`, {
      method: 'POST',
    });
    return handleResponse<TestCase>(response);
  },

  async reset(id: number): Promise<TestCase> {
    const response = await fetch(`${API_BASE_URL}/test-cases/${id}/reset`, {
      method: 'POST',
    });
    return handleResponse<TestCase>(response);
  },
};

// ============== Refinement API ==============

export const refineApi = {
  async refineTestSuite(data: RefinementRequest): Promise<RefinementResponse> {
    const response = await fetch(`${API_BASE_URL}/features/${data.feature_id}/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<RefinementResponse>(response);
  },
};
