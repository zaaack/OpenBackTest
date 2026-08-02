import { useConfirmStore } from '../store/useConfirmStore';

export function ConfirmDialog() {
  const config = useConfirmStore((s) => s.config);
  const hide = useConfirmStore((s) => s.hide);
  if (!config) return null;

  const handleConfirm = () => {
    config.onConfirm();
    hide();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 w-full max-w-md rounded-2xl border border-dark-700 shadow-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-2">{config.title}</h2>
        <p className="text-sm text-slate-400 mb-6 whitespace-pre-line">{config.message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={hide}
            className="px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-200 text-sm font-medium transition-colors"
          >
            {config.cancelLabel ?? 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${
              config.danger ? 'bg-danger hover:brightness-110' : 'bg-primary-500 hover:brightness-110'
            }`}
          >
            {config.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
