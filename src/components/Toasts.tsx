import { AlertTriangle, Info, X } from 'lucide-react'

export interface Toast {
  id: number
  kind: 'error' | 'info'
  text: string
  action?: { label: string; run: () => void }
}

export default function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass pointer-events-auto flex max-w-sm animate-slide-up items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm ${
            t.kind === 'error' ? 'ring-1 ring-amber-400/30' : ''
          }`}
        >
          {t.kind === 'error' ? (
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
          ) : (
            <Info size={17} className="mt-0.5 shrink-0 text-sky-300" />
          )}
          <div className="flex-1 text-slate-200">
            {t.text}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run()
                  onDismiss(t.id)
                }}
                className="mt-1.5 block cursor-pointer font-semibold text-signal hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button onClick={() => onDismiss(t.id)} className="cursor-pointer text-slate-500 hover:text-white" aria-label="Cerrar aviso">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
