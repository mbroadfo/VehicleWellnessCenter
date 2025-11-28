interface ConfirmDeleteModalProps {
  isOpen: boolean;
  vehicleName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({ isOpen, vehicleName, onConfirm, onCancel }: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Delete Vehicle</h2>
        </div>

        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            Are you sure you want to delete <span className="font-semibold">{vehicleName}</span>?
          </p>
          <p className="text-sm text-gray-600">
            This will permanently delete:
          </p>
          <ul className="mt-2 text-sm text-gray-600 list-disc list-inside space-y-1">
            <li>Vehicle information and specifications</li>
            <li>All maintenance events and history</li>
            <li>All chat conversations</li>
          </ul>
          <p className="mt-3 text-sm font-semibold text-red-600">
            This action cannot be undone.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded font-medium transition-colors"
          >
            Delete Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}
