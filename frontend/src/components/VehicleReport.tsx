import { useState } from 'react';
import type { Vehicle } from '../lib/api';

interface VehicleReportProps {
  vehicle: Vehicle;
  onRefresh: () => void;
}

export default function VehicleReport({ vehicle, onRefresh }: VehicleReportProps) {
  const [recallsExpanded, setRecallsExpanded] = useState(false);
  const [complaintsExpanded, setComplaintsExpanded] = useState(false);
  
  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </h1>
          {vehicle.vin && (
            <p className="text-sm text-gray-500 mt-1">VIN: {vehicle.vin}</p>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="btn-secondary"
          title="Refresh vehicle data"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Vehicle Specifications */}
      {vehicle.specs && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Specifications</h2>
          {vehicle.specs.make === 'Loading...' ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4">
            {vehicle.specs.engine && (
              <div>
                <p className="text-sm text-gray-500">Engine</p>
                <p className="font-medium">
                  {vehicle.specs.engine.cylinders && `${vehicle.specs.engine.cylinders}-cylinder `}
                  {vehicle.specs.engine.displacement && `${vehicle.specs.engine.displacement}L `}
                  {vehicle.specs.engine.horsepower && `(${vehicle.specs.engine.horsepower} HP)`}
                </p>
              </div>
            )}
            {vehicle.specs.transmission && (
              <div>
                <p className="text-sm text-gray-500">Transmission</p>
                <p className="font-medium">{vehicle.specs.transmission}</p>
              </div>
            )}
            {vehicle.specs.drive && (
              <div>
                <p className="text-sm text-gray-500">Drivetrain</p>
                <p className="font-medium">{vehicle.specs.drive}</p>
              </div>
            )}
            {vehicle.specs.body?.style && (
              <div>
                <p className="text-sm text-gray-500">Body Style</p>
                <p className="font-medium">{vehicle.specs.body.style}</p>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Fuel Economy */}
      {vehicle.fuelEconomy?.epa && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Fuel Economy</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">
                {vehicle.fuelEconomy.epa.city}
              </div>
              <div className="text-sm text-gray-500">City MPG</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">
                {vehicle.fuelEconomy.epa.highway}
              </div>
              <div className="text-sm text-gray-500">Highway MPG</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">
                {vehicle.fuelEconomy.epa.combined}
              </div>
              <div className="text-sm text-gray-500">Combined MPG</div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between text-sm">
            <span className="text-gray-600">Annual Fuel Cost:</span>
            <span className="font-semibold">${vehicle.fuelEconomy.epa.annualFuelCost}</span>
          </div>
        </div>
      )}

      {/* Safety Ratings */}
      {vehicle.safety?.ncapRating && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">NCAP Safety Ratings</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Overall</p>
              <div className="flex items-center">
                <StarRating rating={vehicle.safety.ncapRating.overall} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Side</p>
              <div className="flex items-center">
                <StarRating rating={vehicle.safety.ncapRating.side} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Front Driver</p>
              <div className="flex items-center">
                <StarRating rating={vehicle.safety.ncapRating.frontDriver} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Rollover</p>
              <div className="flex items-center">
                <StarRating rating={vehicle.safety.ncapRating.rollover} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recalls - Show "No Recalls" if empty */}
      {vehicle.specs && vehicle.specs.make !== 'Loading...' && vehicle.safety && vehicle.safety.recalls.length === 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
              ✓
            </span>
            No Active Recalls
          </h2>
          <p className="text-sm text-gray-600">This vehicle has no open safety recalls at this time.</p>
        </div>
      )}
      {vehicle.safety?.recalls && vehicle.safety.recalls.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
                {vehicle.safety.recalls.length}
              </span>
              Active Recalls
            </h2>
            {vehicle.safety.recalls.length > 3 && (
              <button
                onClick={() => {
                  console.log('Toggling recalls:', !recallsExpanded);
                  setRecallsExpanded(!recallsExpanded);
                }}
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
                {!recall.component && !recall.summary && (
                  <p className="text-sm text-gray-500 italic">Details not available</p>
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
        </div>
      )}

      {/* Consumer Complaints */}
      {vehicle.specs && vehicle.specs.make !== 'Loading...' && vehicle.safety?.complaints && vehicle.safety.complaints.length > 0 && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center">
              <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded mr-2">
                {vehicle.safety.complaints.length}
              </span>
              Consumer Complaints
            </h2>
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

      {/* Empty State */}
      {!vehicle.specs && !vehicle.safety && !vehicle.fuelEconomy && !vehicle.dealerPortal && (
        <div className="card text-center py-12">
          <p className="text-gray-500">
            No data available yet. Chat with the assistant to gather vehicle information.
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
