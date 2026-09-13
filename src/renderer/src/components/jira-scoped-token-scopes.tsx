import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCopyFeedbackState } from '@/components/right-sidebar/source-control/notes/copy-feedback'
import { translate } from '@/i18n/i18n'

// Why: these classic scopes cover every Jira platform endpoint Orca calls; the
// board API behind column order accepts only the granular Jira Software scopes.
export const JIRA_SCOPED_TOKEN_REQUIRED_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user'
] as const
export const JIRA_SCOPED_TOKEN_BOARD_SCOPES = [
  'read:board-scope:jira-software',
  'read:board-scope.admin:jira-software',
  'read:project:jira'
] as const

type ScopeGroup = {
  id: string
  label: string
  copyAllLabel: string
  scopes: readonly string[]
}

/** Scopes a scoped Atlassian API token needs, each copyable for Atlassian's scope search. */
export function JiraScopedTokenScopes(): React.JSX.Element {
  const [copiedId, showCopiedId] = useCopyFeedbackState<string | null>(null)
  const groups: ScopeGroup[] = [
    {
      id: 'required',
      label: translate('auto.components.jira.scoped.token.scopes.required', 'Required scopes'),
      copyAllLabel: translate(
        'auto.components.jira.scoped.token.scopes.copyAllRequired',
        'Copy all required scopes'
      ),
      scopes: JIRA_SCOPED_TOKEN_REQUIRED_SCOPES
    },
    {
      id: 'board',
      label: translate(
        'auto.components.jira.scoped.token.scopes.boardOptional',
        'Optional: board column order'
      ),
      copyAllLabel: translate(
        'auto.components.jira.scoped.token.scopes.copyAllBoard',
        'Copy all board column order scopes'
      ),
      scopes: JIRA_SCOPED_TOKEN_BOARD_SCOPES
    }
  ]

  const copy = async (text: string, feedbackId: string): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(text)
      showCopiedId(feedbackId)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.jira.scoped.token.scopes.copyFailed',
              'Failed to copy scopes.'
            )
      )
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">{group.label}</p>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={group.copyAllLabel}
              onClick={() => void copy(group.scopes.join('\n'), group.id)}
            >
              {copiedId === group.id ? <Check /> : <Copy />}
              {copiedId === group.id
                ? translate('auto.components.jira.scoped.token.scopes.copied', 'Copied')
                : translate('auto.components.jira.scoped.token.scopes.copyAll', 'Copy all')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {group.scopes.map((scope) => (
              <Button
                key={scope}
                type="button"
                variant="outline"
                size="xs"
                className="font-mono text-[11px] font-normal"
                aria-label={translate(
                  'auto.components.jira.scoped.token.scopes.copyScope',
                  'Copy {{value0}}',
                  { value0: scope }
                )}
                onClick={() => void copy(scope, scope)}
              >
                {scope}
                {copiedId === scope ? (
                  <Check className="text-muted-foreground" />
                ) : (
                  <Copy className="text-muted-foreground" />
                )}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
