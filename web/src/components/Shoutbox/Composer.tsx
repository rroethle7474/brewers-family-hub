import { useRef, useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface Props {
  onSend: (body: string) => Promise<{ ok: boolean; error?: string }>
}

const MAX = 2000
const WARN = 1800

/**
 * Top-of-shoutbox composer. Optimistic submit handled by parent via onSend.
 * Cmd/Ctrl+Enter to send; the send button stays the canonical action for
 * touch users.
 */
export function Composer({ onSend }: Props) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const trimmedLength = body.trim().length
  const len = body.length
  const overCap = len > MAX
  const canSend = !busy && trimmedLength > 0 && !overCap
  const counterColor = overCap
    ? 'text-loss'
    : len >= WARN
      ? 'text-gold-deep'
      : 'text-text-muted'

  async function send() {
    if (!canSend) return
    setBusy(true)
    setErrorMsg(null)
    const result = await onSend(body)
    setBusy(false)
    if (result.ok) {
      setBody('')
      textareaRef.current?.focus()
    } else {
      setErrorMsg(result.error ?? 'Failed to post.')
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter sends. Plain Enter inserts a newline (chat convention
    // is split on this; family-chat with longer thoughts wants newlines).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-3 md:p-4 shadow-sm">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="Share a thought…"
        className="w-full resize-none bg-transparent text-text placeholder:text-text-muted focus:outline-none text-sm"
        aria-label="Shoutbox message"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className={`text-[11px] tabular-nums ${counterColor}`}>
          {len}/{MAX}
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium min-h-[40px]',
            canSend
              ? 'bg-navy text-white hover:bg-navy/90'
              : 'bg-bg text-text-muted cursor-not-allowed',
          ].join(' ')}
        >
          <Send size={14} aria-hidden="true" />
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
      {errorMsg && (
        <p className="mt-2 text-xs text-loss" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
