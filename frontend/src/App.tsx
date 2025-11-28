import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { apiClient, type Vehicle } from './lib/api';
import VehicleReport from './components/VehicleReport';
import ChatPane from './components/ChatPane';
import AddVehicleModal from './components/AddVehicleModal';

function App() {
  const { isLoading, isAuthenticated, error: authError, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleIndex, setActiveVehicleIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Redirect to Auth0 login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !authError) {
      loginWithRedirect();
    }
  }, [isLoading, isAuthenticated, authError, loginWithRedirect]);

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
        const vehicleList = await apiClient.listVehicles();
        
        // Step 3: Load full details for all vehicles
        const fullVehicles = await Promise.all(
          vehicleList.map(v => apiClient.getVehicle(v._id))
        );
        
        setVehicles(fullVehicles);
      } catch (err) {
        console.error('Failed to initialize:', err);
        const errorMsg = (err as Error).message;
        if (errorMsg.includes('Refresh Token') || errorMsg.includes('Authentication')) {
          // Clear stale auth data and force re-login
          localStorage.clear();
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

  const handleVehicleAdded = async (vehicleId: string) => {
    try {
      setLoading(true);
      
      // Load initial vehicle data
      let data = await apiClient.getVehicle(vehicleId);
      
      // Ensure specs has proper structure (not nested objects that could render)
      const newVehicle: Vehicle = {
        ...data,
        specs: data.specs || { 
          make: 'Loading...', 
          model: '', 
          year: new Date().getFullYear(),
          decodedAt: new Date().toISOString() 
        },
        safety: data.safety || {
          recalls: [],
          complaints: [],
          lastChecked: new Date().toISOString()
        }
      };
      
      // Add to vehicles array and switch to it
      setVehicles(prev => [...prev, newVehicle]);
      setActiveVehicleIndex(vehicles.length);
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
        setVehicles(prev => prev.map(v => v._id === vehicleId ? data : v));
        console.log('✓ Specifications loaded:', data.specs?.make, data.specs?.model);
      } catch (err) {
        console.error('✗ Failed to load specifications:', err);
        return;
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
        setVehicles(prev => prev.map(v => v._id === vehicleId ? data : v));
        console.log('✓ Safety data loaded:', {
          recalls: data.safety?.recalls?.length || 0,
          complaints: data.safety?.complaints?.length || 0,
          ncapRating: data.safety?.ncapRating?.overall || 'N/A'
        });
      } catch (err) {
        console.error('✗ Failed to load safety data:', err);
      }
      
      // Note: Fuel economy is loaded during VIN enrichment
      if (data.fuelEconomy?.epa) {
        console.log('✓ Fuel economy data available:', data.fuelEconomy.epa);
      }
      
      console.log('=== Enrichment Complete - All External APIs Processed ===');
      
    } catch (err) {
      console.error('Failed to load vehicle:', err);
      setLoading(false);
    }
  };

  const handleVehicleUpdate = async () => {
    const activeVehicle = vehicles[activeVehicleIndex];
    if (!activeVehicle?._id) return;
    
    try {
      const data = await apiClient.getVehicle(activeVehicle._id);
      setVehicles(prev => prev.map(v => v._id === data._id ? data : v));
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

  // If not authenticated, Auth0 redirect happens in useEffect above
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Show loading while fetching vehicles
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your vehicles...</p>
        </div>
      </div>
    );
  }

  const activeVehicle = vehicles[activeVehicleIndex];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Vehicle Wellness Center</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Vehicle
            </button>
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

      {/* Vehicle Tabs */}
      {vehicles.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="container mx-auto">
            <div className="flex gap-2 px-4">
              {vehicles.map((vehicle, index) => {
                const displayName = vehicle.specs?.make && vehicle.specs?.model
                  ? `${vehicle.specs.year || ''} ${vehicle.specs.make} ${vehicle.specs.model}`.trim()
                  : vehicle.vin || `Vehicle ${index + 1}`;
                
                return (
                  <button
                    key={vehicle._id}
                    onClick={() => setActiveVehicleIndex(index)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      index === activeVehicleIndex
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    {displayName}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {vehicles.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md mx-auto px-4">
            <svg className="w-24 h-24 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Vehicles Yet</h2>
            <p className="text-gray-600 mb-6">
              Get started by adding your first vehicle. We'll decode the VIN and gather safety data automatically.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
            >
              Add Your First Vehicle
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden bg-gray-100">
          {/* Left Pane - Vehicle Report */}
          <div className="w-2/3 overflow-y-auto border-r border-gray-300">
            {activeVehicle && (
              <VehicleReport 
                vehicle={activeVehicle} 
                onRefresh={handleVehicleUpdate}
              />
            )}
          </div>

          {/* Right Pane - Chat */}
          <div className="w-1/3 flex flex-col">
            {activeVehicle && (
              <ChatPane 
                sessionId={sessionId}
                vehicleId={activeVehicle._id}
                onSessionIdChange={setSessionId}
                onVehicleUpdate={handleVehicleUpdate}
              />
            )}
          </div>
        </div>
      )}

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onVehicleAdded={handleVehicleAdded}
      />
    </div>
  );
}

export default App;
