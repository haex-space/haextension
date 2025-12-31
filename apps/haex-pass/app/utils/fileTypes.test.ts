import { describe, it, expect } from 'vitest'
import {
  getFileType,
  isImage,
  formatFileSize,
  getMimeType,
  createDataUrl,
} from './fileTypes'

describe('getFileType', () => {
  it('identifies image files', () => {
    expect(getFileType('photo.jpg')).toBe('image')
    expect(getFileType('photo.jpeg')).toBe('image')
    expect(getFileType('image.png')).toBe('image')
    expect(getFileType('animation.gif')).toBe('image')
    expect(getFileType('modern.webp')).toBe('image')
    expect(getFileType('bitmap.bmp')).toBe('image')
    expect(getFileType('vector.svg')).toBe('image')
  })

  it('identifies PDF files', () => {
    expect(getFileType('document.pdf')).toBe('pdf')
    expect(getFileType('DOCUMENT.PDF')).toBe('pdf')
  })

  it('identifies text files', () => {
    expect(getFileType('readme.txt')).toBe('text')
    expect(getFileType('notes.md')).toBe('text')
    expect(getFileType('config.json')).toBe('text')
    expect(getFileType('data.xml')).toBe('text')
    expect(getFileType('data.csv')).toBe('text')
    expect(getFileType('app.log')).toBe('text')
    expect(getFileType('config.yml')).toBe('text')
    expect(getFileType('config.yaml')).toBe('text')
    expect(getFileType('settings.ini')).toBe('text')
    expect(getFileType('app.conf')).toBe('text')
    expect(getFileType('app.config')).toBe('text')
  })

  it('returns other for unknown extensions', () => {
    expect(getFileType('archive.zip')).toBe('other')
    expect(getFileType('binary.exe')).toBe('other')
    expect(getFileType('document.docx')).toBe('other')
    expect(getFileType('noextension')).toBe('other')
  })

  it('handles case insensitivity', () => {
    expect(getFileType('IMAGE.PNG')).toBe('image')
    expect(getFileType('Doc.TXT')).toBe('text')
  })

  it('handles multiple dots in filename', () => {
    expect(getFileType('my.photo.backup.jpg')).toBe('image')
    expect(getFileType('report.2024.pdf')).toBe('pdf')
  })
})

describe('isImage', () => {
  it('returns true for image files', () => {
    expect(isImage('photo.jpg')).toBe(true)
    expect(isImage('image.png')).toBe(true)
    expect(isImage('icon.svg')).toBe(true)
  })

  it('returns false for non-image files', () => {
    expect(isImage('document.pdf')).toBe(false)
    expect(isImage('readme.txt')).toBe(false)
    expect(isImage('archive.zip')).toBe(false)
  })
})

describe('formatFileSize', () => {
  it('returns "0 Bytes" for zero', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
  })

  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 Bytes')
  })

  it('formats KB correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats MB correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB')
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB')
  })

  it('formats GB correctly', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
  })
})

describe('getMimeType', () => {
  it('returns correct MIME for images', () => {
    expect(getMimeType('photo.jpg')).toBe('image/jpeg')
    expect(getMimeType('photo.jpeg')).toBe('image/jpeg')
    expect(getMimeType('image.png')).toBe('image/png')
    expect(getMimeType('animation.gif')).toBe('image/gif')
    expect(getMimeType('modern.webp')).toBe('image/webp')
    expect(getMimeType('bitmap.bmp')).toBe('image/bmp')
    expect(getMimeType('vector.svg')).toBe('image/svg+xml')
  })

  it('returns correct MIME for documents', () => {
    expect(getMimeType('document.pdf')).toBe('application/pdf')
    expect(getMimeType('readme.txt')).toBe('text/plain')
    expect(getMimeType('notes.md')).toBe('text/markdown')
    expect(getMimeType('config.json')).toBe('application/json')
    expect(getMimeType('data.xml')).toBe('application/xml')
    expect(getMimeType('data.csv')).toBe('text/csv')
  })

  it('returns octet-stream for unknown types', () => {
    expect(getMimeType('file.zip')).toBe('application/octet-stream')
    expect(getMimeType('unknown')).toBe('application/octet-stream')
  })
})

describe('createDataUrl', () => {
  it('returns existing data URL as-is', () => {
    const existingDataUrl = 'data:image/png;base64,ABC123'
    expect(createDataUrl(existingDataUrl, 'image.png')).toBe(existingDataUrl)
  })

  it('creates data URL with correct MIME type', () => {
    expect(createDataUrl('ABC123', 'photo.jpg')).toBe('data:image/jpeg;base64,ABC123')
    expect(createDataUrl('XYZ789', 'document.pdf')).toBe('data:application/pdf;base64,XYZ789')
  })

  it('uses octet-stream for unknown types', () => {
    expect(createDataUrl('DATA', 'file.unknown')).toBe('data:application/octet-stream;base64,DATA')
  })
})
