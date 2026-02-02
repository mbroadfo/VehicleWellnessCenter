/**
 * Maintenance Record Types
 * 
 * TypeScript interfaces for structured maintenance data parsed from natural language.
 */

export interface MaintenanceService {
  name: string;
  cost?: number;
  notes?: string;
}

export interface MaintenancePart {
  name: string;
  quantity?: number;
  notes?: string;
}

export interface ParsedMaintenanceRecord {
  vendor: string;
  date: string; // ISO 8601 date string
  odometer: number;
  services: MaintenanceService[];
  total: number;
  parts?: MaintenancePart[];
  notes?: string;
}

export interface ParseMaintenanceRequest {
  vehicleId: string;
  text: string;
}

export interface ParseMaintenanceResponse {
  success: boolean;
  parsed?: ParsedMaintenanceRecord;
  error?: string;
  message?: string;
}
