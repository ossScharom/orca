import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createJiraTempHome,
  jiraTokenPath,
  loadJiraClientModule,
  resetJiraClientMocks,
  type SafeStorageMockOptions
} from './client-test-harness'

const OLD_FETCH = globalThis.fetch
const mocks = vi.hoisted(() => ({
  closeAllConnectionsMock: vi.fn(),
  netFetchMock: vi.fn(),
  resolveProxyMock: vi.fn(),
  setProxyMock: vi.fn()
}))
const { netFetchMock } = mocks

let tempHome = ''

function tokenPathForSite(siteId: string): string {
  return jiraTokenPath(tempHome, siteId)
}

function loadClientModule(options: SafeStorageMockOptions = {}) {
  return loadJiraClientModule(mocks, tempHome, options)
}

beforeEach(() => {
  tempHome = createJiraTempHome()
  resetJiraClientMocks(mocks)
})

afterEach(() => {
  globalThis.fetch = OLD_FETCH
})

describe('Jira client scoped Atlassian API tokens', () => {
  it('connects a scoped Cloud token through the api.atlassian.com gateway', async () => {
    // Why: Atlassian rejects scoped tokens on the site host, so the cloud id is
    // resolved first and every REST call (including later reads) uses the gateway.
    netFetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cloudId: 'cloud-abc' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accountId: 'account-alpha', displayName: 'Ada' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accountId: 'account-alpha', displayName: 'Ada' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    const jira = await loadClientModule()

    await expect(
      jira.connect({
        siteUrl: 'example.atlassian.net',
        email: 'ada@example.com',
        apiToken: 'scoped-token',
        authType: 'cloud-scoped'
      })
    ).resolves.toMatchObject({ ok: true, viewer: { displayName: 'Ada' } })

    expect(netFetchMock.mock.calls[0]?.[0]).toBe('https://example.atlassian.net/_edge/tenant_info')
    expect(netFetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/myself'
    )
    const headers = netFetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('ada@example.com:scoped-token').toString('base64')}`
    )

    const siteFile = JSON.parse(
      readFileSync(join(tempHome, '.orca', 'jira-sites.json'), { encoding: 'utf-8' })
    ) as { sites: { siteUrl: string; authType: string; apiBaseUrl?: string }[] }
    expect(siteFile.sites[0]).toMatchObject({
      siteUrl: 'https://example.atlassian.net',
      authType: 'cloud-scoped',
      apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-abc'
    })
    expect(jira.getStatus().viewer?.displayName).toBe('Ada')

    await expect(jira.testConnection()).resolves.toMatchObject({ ok: true })
    expect(netFetchMock.mock.calls[2]?.[0]).toBe(
      'https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/myself'
    )
  })

  it('sends a scoped Cloud token as Bearer when no email is given', async () => {
    netFetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cloudId: 'cloud-abc' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accountId: 'account-alpha', displayName: 'Ada' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    const jira = await loadClientModule()

    await expect(
      jira.connect({
        siteUrl: 'https://example.atlassian.net',
        email: '',
        apiToken: 'scoped-token',
        authType: 'cloud-scoped'
      })
    ).resolves.toMatchObject({ ok: true, viewer: { accountId: 'account-alpha' } })
    const headers = netFetchMock.mock.calls[1]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer scoped-token')
  })

  it('reports a scoped Cloud connection whose cloud id cannot be resolved', async () => {
    netFetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const jira = await loadClientModule()

    await expect(
      jira.connect({
        siteUrl: 'jira.example.com',
        email: '',
        apiToken: 'scoped-token',
        authType: 'cloud-scoped'
      })
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('cloud id') })
    expect(netFetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-roots scoped-site attachment URLs from the site host onto the gateway', async () => {
    const jira = await loadClientModule({ encryptionAvailable: true })
    const client = {
      site: {
        id: 'site-scoped',
        siteUrl: 'https://example.atlassian.net',
        email: '',
        displayName: 'Ada',
        accountId: 'account-alpha',
        authType: 'cloud-scoped' as const,
        apiBaseUrl: 'https://api.atlassian.com/ex/jira/cloud-abc'
      },
      authorization: 'Bearer scoped-token'
    }
    netFetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      })
    )

    await expect(
      jira.jiraRequestBinary(
        client,
        'https://example.atlassian.net/rest/api/3/attachment/content/1?redirect=false'
      )
    ).resolves.toMatchObject({ contentType: 'image/png' })
    expect(netFetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.atlassian.com/ex/jira/cloud-abc/rest/api/3/attachment/content/1?redirect=false'
    )

    await expect(
      jira.jiraRequestBinary(client, 'https://files.example.com/attachment.png')
    ).rejects.toThrow('configured site origin')
    // Why: the gateway origin is shared by every tenant, so a URL under another
    // cloud id must be refused before the token is attached.
    await expect(
      jira.jiraRequestBinary(
        client,
        'https://api.atlassian.com/ex/jira/other-cloud/rest/api/3/attachment/content/1'
      )
    ).rejects.toThrow('configured site origin')
    await expect(
      jira.jiraRequestBinary(
        client,
        'https://api.atlassian.com/ex/jira/cloud-abc-2/rest/api/3/attachment/content/1'
      )
    ).rejects.toThrow('configured site origin')
    expect(netFetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops a stored scoped site whose gateway URL is not an api.atlassian.com cloud id', async () => {
    // Why: apiBaseUrl decides where the scoped token is sent, so an edited
    // jira-sites.json must not be able to point it at another host.
    const orcaDir = join(tempHome, '.orca')
    mkdirSync(join(orcaDir, 'jira-tokens'), { recursive: true })
    const site = (id: string, apiBaseUrl: string) => ({
      id,
      siteUrl: 'https://example.atlassian.net',
      email: '',
      displayName: 'Ada',
      accountId: 'account-alpha',
      authType: 'cloud-scoped',
      apiBaseUrl
    })
    writeFileSync(
      join(orcaDir, 'jira-sites.json'),
      JSON.stringify({
        version: 1,
        activeSiteId: 'site-ok',
        selectedSiteId: 'site-ok',
        sites: [
          site('site-ok', 'https://api.atlassian.com/ex/jira/cloud-abc'),
          site('site-host', 'https://evil.example.com/ex/jira/cloud-abc'),
          site('site-port', 'https://api.atlassian.com:8443/ex/jira/cloud-abc'),
          site('site-path', 'https://api.atlassian.com/ex/jira/cloud-abc/extra'),
          site('site-http', 'http://api.atlassian.com/ex/jira/cloud-abc')
        ]
      }),
      { encoding: 'utf-8' }
    )
    for (const id of ['site-ok', 'site-host', 'site-port', 'site-path', 'site-http']) {
      writeFileSync(tokenPathForSite(id), 'scoped-token')
    }
    const jira = await loadClientModule()

    expect(jira.getStatus().sites?.map((entry) => entry.id)).toEqual(['site-ok'])
  })
})
