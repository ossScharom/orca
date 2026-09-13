// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JiraScopedTokenScopes } from './jira-scoped-token-scopes'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, options?: Record<string, string>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => options?.[name] ?? '')
}))

const writeClipboardText = vi.fn(async () => undefined)

afterEach(cleanup)

beforeEach(() => {
  writeClipboardText.mockClear()
  Object.assign(window, { api: { ui: { writeClipboardText } } })
})

describe('JiraScopedTokenScopes', () => {
  it('lists the required scopes and the optional board scopes', () => {
    render(<JiraScopedTokenScopes />)

    for (const scope of [
      'read:jira-work',
      'write:jira-work',
      'read:jira-user',
      'read:board-scope:jira-software',
      'read:board-scope.admin:jira-software',
      'read:project:jira'
    ]) {
      expect(screen.getByRole('button', { name: `Copy ${scope}` })).toBeDefined()
    }
  })

  it('copies a single scope when it is clicked', async () => {
    render(<JiraScopedTokenScopes />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy write:jira-work' }))

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('write:jira-work'))
  })

  it('copies a whole group one scope per line', async () => {
    render(<JiraScopedTokenScopes />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy all required scopes' }))
    await waitFor(() =>
      expect(writeClipboardText).toHaveBeenCalledWith(
        'read:jira-work\nwrite:jira-work\nread:jira-user'
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy all board column order scopes' }))
    await waitFor(() =>
      expect(writeClipboardText).toHaveBeenCalledWith(
        'read:board-scope:jira-software\nread:board-scope.admin:jira-software\nread:project:jira'
      )
    )
  })
})
