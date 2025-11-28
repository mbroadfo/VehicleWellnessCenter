// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com';

export interface Vehicle {
  _id: string;
  vin?: string;
  name?: string;
  year?: number;
  make?: string;
  model?: string;
  specs?: VehicleSpecs;
  safety?: SafetyData;
  fuelEconomy?: FuelEconomyData;
  dealerPortal?: DealerPortalData;
  createdAt: string;
  lastUpdated?: string;
}

export interface VehicleSpecs {
  make: string;
  model: string;
  year: number;
  engine?: {
    cylinders?: number;
    displacement?: number;
    horsepower?: number;
    fuelType?: string;
  };
  body?: {
    style?: string;
    doors?: number;
  };
  transmission?: string;
  drive?: string;
  decodedAt: string;
}

export interface SafetyData {
  recalls: RecallData[];
  complaints: ComplaintData[];
  ncapRating?: NCAPRating;
  lastChecked: string;
}

export interface RecallData {
  NHTSACampaignNumber: string;
  reportReceivedDate: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  manufacturer?: string;
  notes?: string;
}

export interface ComplaintData {
  odiNumber: string;
  dateOfIncident?: string;
  summary: string;
  components: string;
}

export interface NCAPRating {
  overall: number;
  frontDriver: number;
  frontPassenger: number;
  side: number;
  rollover: number;
  rolloverPossibility?: number;
}

export interface FuelEconomyData {
  epa?: {
    city: number;
    highway: number;
    combined: number;
    annualFuelCost: number;
    co2: number;
  };
  lastUpdated: string;
}

export interface DealerPortalData {
  source: 'mopar' | 'gm' | 'ford' | 'toyota';
  lastSync: string;
  mileage?: number;
  mileageDate?: string;
  warranty?: {
    basic?: { expires?: string; mileage?: number };
    powertrain?: { expires?: string; mileage?: number };
  };
  coveragePlans?: Array<{
    name: string;
    contractNumber?: string;
    expires?: string;
    type?: string;
  }>;
  connectedServices?: {
    uconnect?: string;
    remote?: string;
  };
}

export interface VehicleEvent {
  _id: string;
  vehicleId: string;
  type: string;
  category: string;
  date: string;
  mileage?: number;
  description: string;
  cost?: number;
  provider?: string;
  source?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

export interface ChatResponse {
  success: boolean;
  message: string; // Changed from 'response' to match backend
  sessionId: string;
  toolsUsed?: string[]; // Changed from 'toolCalls' to match backend
  conversationContext?: {
    messageCount: number;
    historyUsed: number;
  };
}

class APIClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const error = new Error(errorData.error || `HTTP ${response.status}`) as Error & {
        statusCode?: number;
        data?: typeof errorData;
      };
      error.statusCode = response.status;
      error.data = errorData;
      throw error;
    }

    return response.json();
  }

  // Vehicle endpoints
  async listVehicles(): Promise<Vehicle[]> {
    return this.request<Vehicle[]>('/vehicles');
  }

  async createVehicle(data: { vin?: string; name?: string; year?: number; make?: string; model?: string }): Promise<{ vehicleId: string }> {
    // Create vehicle via MongoDB (this will be a new endpoint we add)
    const response = await this.request<{ _id: string }>('/vehicles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { vehicleId: response._id };
  }

  async getVehicle(vehicleId: string): Promise<Vehicle> {
    return this.request<Vehicle>(`/vehicles/${vehicleId}/overview`);
  }

  async enrichVehicle(vehicleId: string, vin: string): Promise<{ success: boolean; specs: VehicleSpecs }> {
    return this.request(`/vehicles/${vehicleId}/enrich`, {
      method: 'POST',
      body: JSON.stringify({ vin }),
    });
  }

  async getSafetyData(vehicleId: string): Promise<SafetyData> {
    return this.request(`/vehicles/${vehicleId}/safety`);
  }

  async getEvents(vehicleId: string): Promise<{ events: VehicleEvent[] }> {
    return this.request(`/vehicles/${vehicleId}/events`);
  }

  async createEvent(vehicleId: string, event: Omit<VehicleEvent, '_id' | 'vehicleId'>): Promise<{ eventId: string }> {
    return this.request(`/vehicles/${vehicleId}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }

  // Chat endpoint
  async sendMessage(message: string, sessionId?: string, vehicleId?: string): Promise<ChatResponse> {
    return this.request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        sessionId,
        vehicleId,
      }),
    });
  }
}

export const apiClient = new APIClient(API_BASE_URL);
