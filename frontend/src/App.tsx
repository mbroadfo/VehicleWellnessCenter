import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { apiClient, type Vehicle } from './lib/api';
import VehicleReport from './components/VehicleReport';
import ChatPane from './components/ChatPane';
import VINOnboarding from './components/VINOnboarding';

function App() {
  const { isLoading, isAuthenticated, error: authError, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get Auth0 token and load vehicles
  useEffect(() => {
    const init = async () => {
      if (!isAuthenticated) return;
      
      try {
        // Step 1: Get token and set in API client
        const token = await getAccessTokenSilently();
        apiClient.setToken(token);
        
        // Step 2: Load user's vehicles
        setLoading(true);
        const vehicles = await apiClient.listVehicles();
        
        if (vehicles.length > 0) {
          // Load the first vehicle with full details
          const fullVehicle = await apiClient.getVehicle(vehicles[0]._id);
          setVehicle(fullVehicle);
        }
      } catch (err) {
        console.error('Failed to initialize:', err);
        const errorMsg = (err as Error).message;
        if (errorMsg.includes('Refresh Token') || errorMsg.includes('Authentication')) {
          // Clear stale auth data and force re-login
          localStorage.clear();
          setError('Session expired. Please log in again.');
          logout({ logoutParams: { returnTo: window.location.origin } });
          return;
        }
        // Don't show error for vehicle loading - just let user add a vehicle
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [isAuthenticated, getAccessTokenSilently, logout]);

  const handleVehicleCreated = async (vehicleId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Load initial vehicle data with loading placeholders for all sections
      let data = await apiClient.getVehicle(vehicleId);
      setVehicle({
        ...data,
        specs: { 
          make: 'Loading...', 
          model: '', 
          year: new Date().getFullYear(),
          decodedAt: new Date().toISOString() 
        },
        safety: {
          recalls: [],
          complaints: [],
          lastChecked: new Date().toISOString()
        }
      });
      setLoading(false);
      
      // Progressive enrichment: Run each external API sequentially
      console.log('=== Starting Progressive Enrichment ===');
      
      if (!data.vin) {
        console.warn('No VIN available for enrichment');
        return;
      }
      
      // Step 1: VIN Decode (NHTSA vPIC) - Vehicle Specifications
      try {
        console.log('1/2: Fetching vehicle specifications (NHTSA vPIC)...');
        await apiClient.enrichVehicle(vehicleId, data.vin);
        data = await apiClient.getVehicle(vehicleId);
        setVehicle(data);
        console.log('✓ Specifications loaded:', data.specs?.make, data.specs?.model);
      } catch (err) {
        console.error('✗ Failed to load specifications:', err);
        return; // Can't continue without specs
      }
      
      // Check if we have required fields for remaining APIs
      if (!data.specs?.make || !data.specs?.model || !data.specs?.year) {
        console.warn('Missing make/model/year - cannot load safety/fuel data');
        return;
      }
      
      // Step 2: Safety Data (NHTSA Recalls + Complaints + NCAP Ratings)
      try {
        console.log('2/2: Fetching safety data (Recalls, Complaints, NCAP)...');
        await apiClient.getSafetyData(vehicleId);
        data = await apiClient.getVehicle(vehicleId);
        setVehicle(data);
        console.log('✓ Safety data loaded:', {
          recalls: data.safety?.recalls?.length || 0,
          complaints: data.safety?.complaints?.length || 0,
          ncapRating: data.safety?.ncapRating?.overall || 'N/A'
        });
      } catch (err) {
        console.error('✗ Failed to load safety data:', err);
      }
      
      // Note: Fuel economy is loaded during VIN enrichment (stored in vehicle.fuelEconomy)
      if (data.fuelEconomy?.epa) {
        console.log('✓ Fuel economy data available:', data.fuelEconomy.epa);
      }
      
      console.log('=== Enrichment Complete - All External APIs Processed ===');
      console.log('AI chat is now available in the right panel.');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicle');
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

  // Show loading screen while Auth0 is initializing
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error screen if Auth0 fails
  if (authError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="card max-w-md text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Authentication Error</h2>
          <p className="text-gray-700 mb-4">{authError.message}</p>
          <button onClick={() => loginWithRedirect()} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-primary-50 to-primary-100">
        <div className="card max-w-md text-center">
          <h1 className="text-3xl font-bold text-primary-900 mb-4">Vehicle Wellness Center</h1>
          <p className="text-gray-600 mb-6">
            Track maintenance, safety recalls, and get AI-powered insights for your vehicles
          </p>
          <button 
            onClick={() => loginWithRedirect()}
            className="btn-primary w-full"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

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
    // Show blank screen while loading to avoid unauthorized API calls
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your vehicles...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="bg-primary-700 text-white p-4 shadow-md">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-xl font-bold">Vehicle Wellness Center</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm">{user?.email}</span>
              <button 
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} 
                className="px-3 py-1 bg-primary-600 hover:bg-primary-500 rounded text-sm"
              >
                Log Out
              </button>
            </div>
          </div>
        </header>
        {/* VIN Onboarding */}
        <div className="flex-1">
          <VINOnboarding 
            onVehicleCreated={handleVehicleCreated}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Vehicle Wellness Center</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user?.email}</span>
            <button 
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} 
              className="px-3 py-1 bg-primary-600 hover:bg-primary-500 rounded text-sm"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden bg-gray-100">
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
          vehicleId={vehicle?._id}
          onSessionIdChange={setSessionId}
          onVehicleUpdate={handleVehicleUpdate}
        />
      </div>
      </div>
    </div>
  );
}

export default App;
