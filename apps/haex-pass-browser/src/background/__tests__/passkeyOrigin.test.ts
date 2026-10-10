import { describe, expect, it } from 'vitest'
import { callerOrigin, rpIdMatchesOrigin } from '../passkeyOrigin'

describe('callerOrigin', () => {
  it('takes the origin of the tab for the top frame', () => {
    expect(callerOrigin(0, 'https://login.example.com/signin?next=/')).toBe('https://login.example.com')
    expect(callerOrigin(undefined, 'https://example.com:8443/')).toBe('https://example.com:8443')
  })

  it('refuses messages from sub-frames, where the tab URL is not the caller', () => {
    expect(callerOrigin(3, 'https://example.com/')).toBeNull()
  })

  it('refuses tabs without a usable URL', () => {
    expect(callerOrigin(0, undefined)).toBeNull()
    expect(callerOrigin(0, 'not a url')).toBeNull()
    expect(callerOrigin(0, 'data:text/html,hi')).toBeNull()
  })
})

describe('rpIdMatchesOrigin', () => {
  it('accepts the page host and its parent domains', () => {
    expect(rpIdMatchesOrigin('example.com', 'https://example.com')).toBe(true)
    expect(rpIdMatchesOrigin('example.com', 'https://login.example.com')).toBe(true)
    expect(rpIdMatchesOrigin('localhost', 'http://localhost:3000')).toBe(true)
  })

  it('rejects another site, including look-alike suffixes', () => {
    expect(rpIdMatchesOrigin('bank.com', 'https://evil.com')).toBe(false)
    expect(rpIdMatchesOrigin('example.com', 'https://notexample.com')).toBe(false)
    expect(rpIdMatchesOrigin('login.example.com', 'https://example.com')).toBe(false)
  })

  it('rejects insecure contexts and empty input', () => {
    expect(rpIdMatchesOrigin('example.com', 'http://example.com')).toBe(false)
    expect(rpIdMatchesOrigin('', 'https://example.com')).toBe(false)
    expect(rpIdMatchesOrigin('example.com', 'garbage')).toBe(false)
  })
})
