import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectInputFields } from '../detector'

beforeEach(() => {
  // jsdom lays nothing out; every input counts as visible
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 200, height: 30 } as DOMRect)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('detectInputFields', () => {
  it('finds the username field next to a site search that mentions users (Hugging Face)', () => {
    document.body.innerHTML = `
      <header>
        <input autocomplete="off" name="" placeholder="Search models, datasets, users..." type="text">
      </header>
      <form method="post" action="/login">
        <input autocomplete="username webauthn" name="username" placeholder="Username or Email address" type="text">
        <input autocomplete="current-password" name="password" placeholder="Password" type="password">
      </form>`

    const fields = detectInputFields()

    expect(fields.map(f => [f.element.name, f.type])).toEqual([
      ['username', 'username'],
      ['password', 'password'],
    ])
  })

  it('skips search boxes', () => {
    document.body.innerHTML = `
      <input type="text" role="searchbox" name="user">
      <form role="search"><input type="text" name="login"></form>
      <input type="text" aria-label="Benutzer suchen" name="u">`

    expect(detectInputFields()).toEqual([])
  })

  it('keeps every field when identifiers repeat', () => {
    document.body.innerHTML = `
      <form id="login-header"><input type="email"><input type="password"></form>
      <form id="login-main"><input type="email"><input type="password"></form>`

    expect(detectInputFields().map(f => f.identifier)).toEqual(['email', 'password', 'email', 'password'])
  })
})
