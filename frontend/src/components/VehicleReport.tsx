import { useState } from 'react';
import type { Vehicle } from '../lib/api';

interface VehicleReportProps {
  vehicle: Vehicle;
  onRefresh: () => void;
  onRefreshSpecs?: () => Promise<void>;
  onRefreshSafety?: () => Promise<void>;
  onRefreshFuelEconomy?: () => Promise<void>;
  onDelete?: () => void;
  loadingSpecs?: boolean;
  loadingSafety?: boolean;
  loadingFuelEconomy?: boolean;
}

export default function VehicleReport({ 
  vehicle, 
  onRefresh,
  onRefreshSpecs,
  onRefreshSafety,
  onRefreshFuelEconomy,
  onDelete,
  loadingSpecs = false,
  loadingSafety = false,
  loadingFuelEconomy = false
}: VehicleReportProps) {
  const [recallsExpanded, setRecallsExpanded] = useState(false);
  const [complaintsExpanded, setComplaintsExpanded] = useState(false);
  const [refreshingSpecs, setRefreshingSpecs] = useState(false);
  const [refreshingSafety, setRefreshingSafety] = useState(false);
  const [refreshingFuelEconomy, setRefreshingFuelEconomy] = useState(false);
  
  const handleRefreshSpecs = async () => {
    if (!onRefreshSpecs) return;
    setRefreshingSpecs(true);
    try {
      await onRefreshSpecs();
    } finally {
      setRefreshingSpecs(false);
    }
  };

  const handleRefreshSafety = async () => {
    if (!onRefreshSafety) return;
    setRefreshingSafety(true);
    try {
      await onRefreshSafety();
    } finally {
      setRefreshingSafety(false);
    }
  };

  const handleRefreshFuelEconomy = async () => {
    if (!onRefreshFuelEconomy) return;
    setRefreshingFuelEconomy(true);
    try {
      await onRefreshFuelEconomy();
    } finally {
      setRefreshingFuelEconomy(false);
    }
  };

  const isLoadingSpecs = loadingSpecs || refreshingSpecs || !vehicle.specs || vehicle.specs.make === 'Loading...';
  const isLoadingSafety = loadingSafety || refreshingSafety || !vehicle.safety;
  const isLoadingFuelEconomy = loadingFuelEconomy || refreshingFuelEconomy || !vehicle.fuelEconomy?.epa;
  
  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {vehicle.specs?.year || vehicle.year} {vehicle.specs?.make || vehicle.make} {vehicle.specs?.model || vehicle.model}
          </h1>
          {vehicle.vin && (
            <p className="text-sm text-gray-500 mt-1">VIN: {vehicle.vin}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="btn-secondary flex items-center gap-2"
            title="Refresh all vehicle data"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh All
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded font-medium flex items-center gap-2 transition-colors"
              title="Delete this vehicle"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Vehicle Specifications */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Specifications</h2>
            {isLoadingSpecs && (
              <div className="flex items-center gap-2 text-primary-600 text-sm animate-pulse">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Fetching from NHTSA vPIC...</span>
              </div>
            )}
          </div>
          {onRefreshSpecs && !isLoadingSpecs && (
            <button
              onClick={handleRefreshSpecs}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              title="Refresh specifications"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
        {isLoadingSpecs ? (
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-6 bg-linear-to-r from-primary-200 to-primary-100 rounded w-2/3"></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-16"></div>
                <div className="h-4 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-28"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-16"></div>
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-20"></div>
                <div className="h-4 bg-gray-200 rounded w-28"></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {vehicle.specs?.engine && (
              <div>
                <p className="text-sm text-gray-500">Engine</p>
                <p className="font-medium">
                  {vehicle.specs.engine.cylinders && `${vehicle.specs.engine.cylinders}-cylinder `}
                  {vehicle.specs.engine.displacement && `${vehicle.specs.engine.displacement}L `}
                  {vehicle.specs.engine.horsepower && `(${vehicle.specs.engine.horsepower} HP)`}
                </p>
              </div>
            )}
            {vehicle.specs?.transmission && (
              <div>
                <p className="text-sm text-gray-500">Transmission</p>
                <p className="font-medium">
                  {vehicle.specs.transmission.type}
                  {vehicle.specs.transmission.speeds && ` (${vehicle.specs.transmission.speeds}-speed)`}
                </p>
              </div>
            )}
            {vehicle.specs?.drive && (
              <div>
                <p className="text-sm text-gray-500">Drivetrain</p>
                <p className="font-medium">{vehicle.specs.drive}</p>
              </div>
            )}
            {vehicle.specs?.body?.style && (
              <div>
                <p className="text-sm text-gray-500">Body Style</p>
                <p className="font-medium">{vehicle.specs.body.style}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fuel Economy */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Fuel Economy</h2>
            {isLoadingFuelEconomy && (
              <div className="flex items-center gap-2 text-primary-600 text-sm animate-pulse">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Fetching EPA data...</span>
              </div>
            )}
          </div>
          {onRefreshFuelEconomy && !isLoadingFuelEconomy && (
            <button
              onClick={handleRefreshFuelEconomy}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              title="Refresh fuel economy"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
        {isLoadingFuelEconomy ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center space-y-2">
                  <div className="h-10 bg-linear-to-r from-primary-200 to-primary-100 rounded w-16 mx-auto"></div>
                  <div className="h-3 bg-gray-200 rounded w-20 mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {vehicle.fuelEconomy?.epa?.city}
                </div>
                <div className="text-sm text-gray-500">City MPG</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {vehicle.fuelEconomy?.epa?.highway}
                </div>
                <div className="text-sm text-gray-500">Highway MPG</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">
                  {vehicle.fuelEconomy?.epa?.combined}
                </div>
                <div className="text-sm text-gray-500">Combined MPG</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between text-sm">
              <span className="text-gray-600">Annual Fuel Cost:</span>
              <span className="font-semibold">${vehicle.fuelEconomy?.epa?.annualFuelCost}</span>
            </div>
          </>
        )}
      </div>

      {/* Safety Data */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Safety Data</h2>
            {isLoadingSafety && (
              <div className="flex items-center gap-2 text-primary-600 text-sm animate-pulse">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Fetching recalls, complaints & ratings...</span>
              </div>
            )}
          </div>
          {onRefreshSafety && !isLoadingSafety && (
            <button
              onClick={handleRefreshSafety}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              title="Refresh safety data"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
        
        {isLoadingSafety ? (
          <div className="space-y-6 animate-pulse">
            {/* Loading skeleton for ratings */}
            <div>
              <div className="h-5 bg-gray-200 rounded w-32 mb-4"></div>
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                    <div className="h-4 bg-linear-to-r from-yellow-200 to-yellow-100 rounded w-32"></div>
                  </div>
                ))}
              </div>
            </div>
            {/* Loading skeleton for recalls */}
            <div className="space-y-3 pt-6 border-t">
              <div className="h-5 bg-gray-200 rounded w-40"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ) : (
          <>
            {/* Safety Ratings */}
            {vehicle.safety?.ncapRating && (
              <div>
                <h3 className="text-lg font-semibold mb-4">NCAP Safety Ratings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Overall</p>
                    <StarRating rating={vehicle.safety.ncapRating.overall} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Side</p>
                    <StarRating rating={vehicle.safety.ncapRating.side} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Front Driver</p>
                    <StarRating rating={vehicle.safety.ncapRating.frontDriver} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Rollover</p>
                    <StarRating rating={vehicle.safety.ncapRating.rollover} />
                  </div>
                </div>
              </div>
            )}

            {/* Recalls */}
            {vehicle.safety && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                {vehicle.safety.recalls.length === 0 ? (
                  <>
                    <h3 className="text-lg font-semibold mb-2 flex items-center">
                      <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
                        ✓
                      </span>
                      No Active Recalls
                    </h3>
                    <p className="text-sm text-gray-600">This vehicle has no open safety recalls at this time.</p>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold flex items-center">
                        <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
                          {vehicle.safety.recalls.length}
                        </span>
                        Active Recalls
                      </h3>
                      {vehicle.safety.recalls.length > 3 && (
                        <button
                          onClick={() => setRecallsExpanded(!recallsExpanded)}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                        >
                          {recallsExpanded ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              Show Less
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              View All {vehicle.safety.recalls.length}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {(recallsExpanded ? vehicle.safety.recalls : vehicle.safety.recalls.slice(0, 3)).map((recall, idx) => (
                        <div key={idx} className="border-l-4 border-red-500 pl-4 py-2">
                          {recall.component && (
                            <p className="font-medium text-gray-900">{recall.component}</p>
                          )}
                          {recall.summary && (
                            <p className="text-sm text-gray-600 mt-1">{recall.summary}</p>
                          )}
                          {recallsExpanded && recall.consequence && (
                            <p className="text-sm text-gray-700 mt-2">
                              <span className="font-medium">Consequence:</span> {recall.consequence}
                            </p>
                          )}
                          {recallsExpanded && recall.remedy && (
                            <p className="text-sm text-gray-700 mt-2">
                              <span className="font-medium">Remedy:</span> {recall.remedy}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Campaign: {recall.NHTSACampaignNumber}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Complaints */}
            {vehicle.safety?.complaints && vehicle.safety.complaints.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
                      {vehicle.safety.complaints.length}
                    </span>
                    Consumer Complaints
                  </h3>
                  {vehicle.safety.complaints.length > 5 && (
                    <button
                      onClick={() => setComplaintsExpanded(!complaintsExpanded)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {complaintsExpanded ? 'Show Less' : `View All ${vehicle.safety.complaints.length}`}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(complaintsExpanded ? vehicle.safety.complaints : vehicle.safety.complaints.slice(0, 5)).map((complaint, idx) => (
                    <div key={idx} className="border-l-4 border-yellow-500 pl-4">
                      <p className="text-sm text-gray-900">
                        {complaintsExpanded ? complaint.summary : complaint.summary.substring(0, 120) + '...'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        ODI: {complaint.odiNumber}{complaint.dateOfIncident && ` • ${new Date(complaint.dateOfIncident).toLocaleDateString()}`}
                      </p>
                      {complaintsExpanded && complaint.components && (
                        <p className="text-xs text-gray-600 mt-1">
                          Components: {complaint.components}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dealer Portal Data */}
      {vehicle.dealerPortal && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Dealer Portal Data</h2>
          <div className="space-y-4">
            {vehicle.dealerPortal.mileage && (
              <div>
                <p className="text-sm text-gray-500">Current Mileage</p>
                <p className="text-2xl font-bold text-primary-600">
                  {vehicle.dealerPortal.mileage.toLocaleString()} miles
                </p>
                {vehicle.dealerPortal.mileageDate && (
                  <p className="text-xs text-gray-500">
                    As of {new Date(vehicle.dealerPortal.mileageDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {vehicle.dealerPortal.warranty && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Warranty Status</p>
                {vehicle.dealerPortal.warranty.basic && (
                  <p className="text-sm text-gray-600">
                    Basic: {vehicle.dealerPortal.warranty.basic.expires || 'Expired'}
                  </p>
                )}
                {vehicle.dealerPortal.warranty.powertrain && (
                  <p className="text-sm text-gray-600">
                    Powertrain: {vehicle.dealerPortal.warranty.powertrain.expires || 'Expired'}
                  </p>
                )}
              </div>
            )}

            {vehicle.dealerPortal.coveragePlans && vehicle.dealerPortal.coveragePlans.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Coverage Plans</p>
                {vehicle.dealerPortal.coveragePlans.map((plan, idx) => (
                  <div key={idx} className="text-sm text-gray-600">
                    {plan.name} {plan.expires && `(expires ${plan.expires})`}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Source: {vehicle.dealerPortal.source} • 
            Last synced: {new Date(vehicle.dealerPortal.lastSync).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-5 h-5 ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-2 text-sm font-medium">{rating}/5</span>
    </div>
  );
}
