import { useState } from 'react';
import { apiClient } from '../lib/api';

interface VINOnboardingProps {
  onVehicleCreated: (vehicleId: string) => void;
  onSessionIdCreated: (sessionId: string) => void;
}

export default function VINOnboarding({ onVehicleCreated, onSessionIdCreated }: VINOnboardingProps) {
  const [vin, setVin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!vin || vin.length !== 17) {
      setError('Please enter a valid 17-character VIN');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create vehicle with VIN
      const { vehicleId } = await apiClient.createVehicle({ vin });
      
      // Step 2: Enrich with VIN decode
      await apiClient.enrichVehicle(vehicleId, vin);
      
      // Step 3: Start chat session by sending initial message
      const chatResponse = await apiClient.sendMessage(
        `I just added my vehicle with VIN ${vin}. What information can you help me gather about it?`
      );
      
      if (chatResponse.sessionId) {
        onSessionIdCreated(chatResponse.sessionId);
      }
      
      // Step 4: Notify parent
      onVehicleCreated(vehicleId);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add vehicle');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-primary-50 to-primary-100">
      <div className="card max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Vehicle Wellness Center
          </h1>
          <p className="text-gray-600">
            Enter your VIN to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-2">
              Vehicle Identification Number (VIN)
            </label>
            <input
              id="vin"
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="Enter 17-character VIN"
              maxLength={17}
              className="input"
              disabled={loading}
            />
            <p className="mt-1 text-sm text-gray-500">
              {vin.length}/17 characters
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || vin.length !== 17}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding Vehicle...
              </span>
            ) : (
              'Add My Vehicle'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Your VIN will be used to decode vehicle specifications and gather safety data.
            All data is stored securely.
          </p>
        </div>
      </div>
    </div>
  );
}
