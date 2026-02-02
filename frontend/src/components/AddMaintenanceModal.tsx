import { useState } from 'react';
import { apiClient, type ParsedMaintenanceRecord } from '../lib/api';

interface AddMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  onMaintenanceAdded: () => void;
}

export default function AddMaintenanceModal({
  isOpen,
  onClose,
  vehicleId,
  onMaintenanceAdded,
}: AddMaintenanceModalProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedMaintenanceRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const handleParse = async () => {
    if (!text.trim()) {
      setError('Please enter maintenance details');
      return;
    }

    setLoading(true);
    setError(null);
    setParsed(null);

    try {
      const response = await apiClient.parseMaintenance(vehicleId, text);
      
      if (response.success && response.parsed) {
        setParsed(response.parsed);
      } else {
        setError(response.error || 'Failed to parse maintenance record');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse maintenance record');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!parsed) return;

    setSaving(true);
    setError(null);

    try {
      // Create a vehicle event with the parsed data
      const eventData = {
        type: 'maintenance',
        category: 'maintenance',
        date: parsed.date,
        occurredAt: parsed.date,
        summary: `${parsed.vendor} - ${parsed.services.map(s => s.name).join(', ')}`,
        description: parsed.notes || '',
        provider: parsed.vendor,
        cost: parsed.total,
        mileage: parsed.odometer,
      };

      await apiClient.createEvent(vehicleId, eventData);
      
      // Reset and close
      setText('');
      setParsed(null);
      onMaintenanceAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save maintenance record');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setText('');
    setParsed(null);
    setError(null);
    onClose();
  };

  const handleEdit = () => {
    setParsed(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Add Maintenance Record</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {!parsed ? (
            /* Input Phase */
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe the maintenance in natural language:
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Example: Jiffy Lube 1/15/2026 45k miles - oil change, tire rotation, cabin filter $125"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[120px] font-mono text-sm"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Include: vendor, date, mileage, services, and total cost. The AI will structure it for you.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleParse}
                  disabled={loading || !text.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Parsing...
                    </>
                  ) : (
                    'Parse with AI'
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Preview Phase */
            <>
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                <div className="flex items-start gap-2 mb-2">
                  <svg className="w-5 h-5 text-green-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">Successfully parsed!</p>
                    <p className="text-xs text-green-700 mt-1">Review the details below and click Save to add this record.</p>
                  </div>
                </div>
              </div>

              {/* Parsed Data Preview */}
              <div className="space-y-4 mb-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Vendor</label>
                    <p className="text-sm font-semibold text-gray-900">{parsed.vendor}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(parsed.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Odometer</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {parsed.odometer.toLocaleString()} miles
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Total Cost</label>
                    <p className="text-sm font-semibold text-gray-900">
                      ${parsed.total.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Services */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Services</label>
                  <div className="space-y-2">
                    {parsed.services.map((service, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-200"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{service.name}</p>
                          {service.notes && (
                            <p className="text-xs text-gray-600 mt-0.5">{service.notes}</p>
                          )}
                        </div>
                        {service.cost !== undefined && (
                          <span className="text-sm font-semibold text-gray-700">
                            ${service.cost.toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Parts */}
                {parsed.parts && parsed.parts.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Parts Noted</label>
                    <div className="space-y-1">
                      {parsed.parts.map((part, idx) => (
                        <div key={idx} className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-medium text-gray-900">{part.name}</p>
                            {part.quantity && (
                              <span className="text-xs text-gray-600">Qty: {part.quantity}</span>
                            )}
                          </div>
                          {part.notes && (
                            <p className="text-xs text-yellow-800 mt-1">{part.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {parsed.notes && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <p className="text-sm text-gray-700 p-2 bg-gray-50 rounded border border-gray-200">
                      {parsed.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Edit Text
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Maintenance Record
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
