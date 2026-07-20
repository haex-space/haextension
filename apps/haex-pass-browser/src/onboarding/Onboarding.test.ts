import { flushPromises, mount } from '@vue/test-utils'
import { ExternalConnectionState } from '@haex-space/vault-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeBrowser } from '~/tests/webextensionMock'

vi.mock('webextension-polyfill', () => {
  const fake = createFakeBrowser()
  return { default: fake, ...fake }
})

import browser from 'webextension-polyfill'
import { i18n } from '~/locales'
import { BOOKMARKS_LIST_COLLECTIONS, BOOKMARKS_ONBOARDING_DECISION } from '~/bookmarks/messages'
import { MSG_CONNECT, MSG_GET_CONNECTION_STATE } from '~/logic/messages'
import Onboarding from './Onboarding.vue'

const fake = browser as unknown as ReturnType<typeof createFakeBrowser>

function mockConnectionState(state: ExternalConnectionState) {
  fake.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
    const message = msg as { type?: string }
    if (message.type === MSG_GET_CONNECTION_STATE)
      return { state }
    if (message.type === MSG_CONNECT)
      return { success: true }
    if (message.type === BOOKMARKS_LIST_COLLECTIONS)
      return { success: true, data: { collections: [] } }
    return undefined
  })
}

function mountOnboarding() {
  return mount(Onboarding, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  fake.__store.clear()
  vi.clearAllMocks()
  fake.permissions.request.mockResolvedValue(true)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  )
})

describe('connection gating', () => {
  it('shows a waiting state while not paired', async () => {
    mockConnectionState(ExternalConnectionState.DISCONNECTED)
    const wrapper = mountOnboarding()
    await flushPromises()
    expect(wrapper.text()).toContain('Connecting to HaexVault')
  })

  it('never requests the bookmarks permission before any click', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    mountOnboarding()
    await flushPromises()
    expect(fake.permissions.request).not.toHaveBeenCalled()
  })
})

describe('choice screen', () => {
  it('hides "load existing" when the vault has no collections', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    const wrapper = mountOnboarding()
    await flushPromises()
    expect(wrapper.text()).toContain('Create a new collection')
    expect(wrapper.text()).not.toContain('Load an existing collection')
  })

  it('shows "load existing" when collections are present', async () => {
    fake.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      const message = msg as { type?: string }
      if (message.type === MSG_GET_CONNECTION_STATE)
        return { state: ExternalConnectionState.PAIRED }
      if (message.type === BOOKMARKS_LIST_COLLECTIONS) {
        return {
          success: true,
          data: { collections: [{ id: 'c1', name: 'Private', updatedAt: null, bookmarkCount: 3, deviceLabels: ['Firefox · Linux · abc123'] }] },
        }
      }
      return undefined
    })
    const wrapper = mountOnboarding()
    await flushPromises()
    expect(wrapper.text()).toContain('Load an existing collection')
  })
})

describe('later decision', () => {
  it('sends a disabled decision and shows the done state', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    const wrapper = mountOnboarding()
    await flushPromises()

    fake.runtime.sendMessage.mockResolvedValueOnce({ success: true })
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()

    expect(fake.runtime.sendMessage).toHaveBeenCalledWith({ type: BOOKMARKS_ONBOARDING_DECISION, decision: 'disabled' })
    expect(wrapper.text()).toContain('Bookmark sync stays off')
  })
})

describe('create decision', () => {
  it('rejects an empty name without requesting permission', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(2)').trigger('click')
    await wrapper.find('#new-collection-name').setValue('   ')
    await wrapper.find('button.bg-primary').trigger('click')
    await flushPromises()

    expect(fake.permissions.request).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This field cannot be empty')
  })

  it('prefills the device label as "<Browser> · <OS> · <first 6 chars of replicaId>"', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(2)').trigger('click')

    const label = (wrapper.find('#device-label-create').element as HTMLInputElement).value
    expect(label).toMatch(/^Firefox · Linux · [0-9a-f]{6}$/)
  })

  it('requests the bookmarks permission on submit and sends the create decision', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(2)').trigger('click')
    await wrapper.find('#new-collection-name').setValue('Private')

    fake.runtime.sendMessage.mockResolvedValueOnce({ success: true })
    await wrapper.find('button.bg-primary').trigger('click')
    await flushPromises()

    expect(fake.permissions.request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    const call = fake.runtime.sendMessage.mock.calls.find((c: unknown[]) => (c[0] as { type?: string }).type === BOOKMARKS_ONBOARDING_DECISION)
    expect(call?.[0]).toMatchObject({ decision: 'create', name: 'Private', browserFamily: 'firefox' })
    expect(wrapper.text()).toContain('being saved to the new collection')
  })

  it('shows a permission-denied message and does not send the decision when denied', async () => {
    mockConnectionState(ExternalConnectionState.PAIRED)
    fake.permissions.request.mockResolvedValueOnce(false)
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(2)').trigger('click')
    await wrapper.find('#new-collection-name').setValue('Private')
    await wrapper.find('button.bg-primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Bookmark permission was denied')
    const decisionCalls = fake.runtime.sendMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type?: string }).type === BOOKMARKS_ONBOARDING_DECISION,
    )
    expect(decisionCalls).toHaveLength(0)
  })
})

describe('activate decision', () => {
  function mockWithOneCollection() {
    fake.runtime.sendMessage.mockImplementation(async (msg: unknown) => {
      const message = msg as { type?: string }
      if (message.type === MSG_GET_CONNECTION_STATE)
        return { state: ExternalConnectionState.PAIRED }
      if (message.type === BOOKMARKS_LIST_COLLECTIONS) {
        return {
          success: true,
          data: { collections: [{ id: 'c1', name: 'Private', updatedAt: null, bookmarkCount: 3, deviceLabels: [] }] },
        }
      }
      return { success: true }
    })
  }

  it('shows the replace warning only after a collection is selected, before any load happens', async () => {
    mockWithOneCollection()
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(3)').trigger('click')

    expect(wrapper.text()).not.toContain('will be replaced')
    expect(fake.permissions.request).not.toHaveBeenCalled()

    await wrapper.find('li').trigger('click')
    expect(wrapper.text()).toContain('will be replaced by "Private"')
    expect(fake.permissions.request).not.toHaveBeenCalled()
  })

  it('requests permission and sends the activate decision once confirmed', async () => {
    mockWithOneCollection()
    const wrapper = mountOnboarding()
    await flushPromises()
    await wrapper.find('button:nth-of-type(3)').trigger('click')
    await wrapper.find('li').trigger('click')
    await wrapper.find('button.bg-primary').trigger('click')
    await flushPromises()

    expect(fake.permissions.request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    const call = fake.runtime.sendMessage.mock.calls.find((c: unknown[]) => (c[0] as { type?: string }).type === BOOKMARKS_ONBOARDING_DECISION)
    expect(call?.[0]).toMatchObject({ decision: 'activate', collectionId: 'c1', collectionName: 'Private' })
  })
})
