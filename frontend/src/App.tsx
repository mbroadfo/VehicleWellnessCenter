import { useState, useEffect } from 'react';
import { apiClient, type Vehicle } from './lib/api';
import VehicleReport from './components/VehicleReport';
import ChatPane from './components/ChatPane';
import VINOnboarding from './components/VINOnboarding';

function App() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For now, use a mock token - in production, this would come from Auth0
  useEffect(() => {
    // TODO: Replace with real Auth0 authentication
    const mockToken = 'mock-development-token';
    apiClient.setToken(mockToken);
  }, []);

  const handleVehicleCreated = async (vehicleId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getVehicle(vehicleId);
      setVehicle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleUpdate = async () => {
    if (!vehicle?._id) return;
    
    try {
      const data = await apiClient.getVehicle(vehicle._id);
      setVehicle(data);
    } catch (err) {
      console.error('Failed to refresh vehicle:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading vehicle data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="card max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700">{error}</p>
          <button 
            onClick={() => setError(null)} 
            className="btn-primary mt-4"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <VINOnboarding 
        onVehicleCreated={handleVehicleCreated}
        onSessionIdCreated={setSessionId}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Left Pane - Vehicle Report */}
      <div className="w-2/3 overflow-y-auto border-r border-gray-300">
        <VehicleReport 
          vehicle={vehicle} 
          onRefresh={handleVehicleUpdate}
        />
      </div>

      {/* Right Pane - Chat */}
      <div className="w-1/3 flex flex-col">
        <ChatPane 
          sessionId={sessionId}
          onSessionIdChange={setSessionId}
          onVehicleUpdate={handleVehicleUpdate}
        />
      </div>
    </div>
  );
}

export default App;
