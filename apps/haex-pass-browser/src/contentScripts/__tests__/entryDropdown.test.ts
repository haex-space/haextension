import { afterEach, describe, expect, it, vi } from 'vitest'
import { showEntryDropdown } from '../entryDropdown'

const entries = [{ id: 'e1', title: 'Example', fields: { username: 'anna', password: 'secret' } }]

function setup() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'closed' })
  const anchor = document.createElement('div')
  document.body.appendChild(anchor)
  const onSelect = vi.fn()
  showEntryDropdown('field-1', anchor, entries, root, onSelect)
  return { root, onSelect }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('showEntryDropdown', () => {
  it('renders the entries inside the overlay root, out of the page DOM', () => {
    const { root } = setup()

    expect(root.querySelector('.haex-pass-dropdown')?.textContent).toContain('anna')
    expect(document.body.textContent).not.toContain('anna')
  })

  it('does not fill on a synthetic click', () => {
    const { root, onSelect } = setup()

    root.querySelector<HTMLElement>('.haex-pass-dropdown > div')!.click()

    expect(onSelect).not.toHaveBeenCalled()
  })
})
