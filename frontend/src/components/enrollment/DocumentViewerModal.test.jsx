import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocumentViewerModal from './DocumentViewerModal'

vi.mock('../../services/api', () => ({
  API_BASE: '/api',
  authHeader: () => ({ Authorization: 'Token test' }),
}))

const PDF_DOC = {
  id: 3,
  name: 'PSA Birth Certificate',
  status: 'submitted',
  status_display: 'Awaiting Review',
  original_filename: 'birth.pdf',
}

function jsonResponse(blob) {
  return { ok: true, blob: () => Promise.resolve(blob) }
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  global.fetch = vi.fn()
})

describe('DocumentViewerModal', () => {
  it('reads the file through the authorized endpoint and shows a blob preview', async () => {
    const fetchMock = global.fetch.mockResolvedValue(
      jsonResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    )
    render(
      <DocumentViewerModal
        open
        doc={PDF_DOC}
        applicationId={9}
        onClose={() => {}}
      />
    )

    const frame = await screen.findByTitle('Preview of PSA Birth Certificate')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.getAttribute('src')).toBe('blob:preview')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/enrollment/applications/9/documents/3/download/',
      { headers: { Authorization: 'Token test' } }
    )
    // The private media path must never be what the frame points at.
    expect(frame.getAttribute('src')).not.toContain('/media/')
  })

  it('re-stamps an unrecognized response type so the frame can render it', async () => {
    global.fetch.mockResolvedValue(jsonResponse(new Blob(['%PDF-1.4'])))
    render(<DocumentViewerModal open doc={PDF_DOC} applicationId={9} onClose={() => {}} />)

    await screen.findByTitle('Preview of PSA Birth Certificate')
    const handed = URL.createObjectURL.mock.calls[0][0]
    expect(handed.type).toBe('application/pdf')
  })

  it('gives an image a zoom control', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(new Blob(['x'], { type: 'image/jpeg' }))
    )
    render(
      <DocumentViewerModal
        open
        doc={{ ...PDF_DOC, original_filename: 'form.jpg' }}
        applicationId={9}
        onClose={() => {}}
      />
    )

    const image = await screen.findByAltText('Preview of PSA Birth Certificate')
    expect(image.getAttribute('src')).toBe('blob:preview')
    expect(image.style.transform).toBe('scale(1)')

    await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(image.style.transform).toBe('scale(1.25)')
  })

  it('says so when the browser cannot render the file at all', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(new Blob(['x'], { type: 'application/msword' }))
    )
    render(
      <DocumentViewerModal
        open
        doc={{ ...PDF_DOC, original_filename: 'card.docx' }}
        applicationId={9}
        onClose={() => {}}
      />
    )

    expect(await screen.findByText(/cannot display/i)).toBeInTheDocument()
    expect(screen.queryByTitle(/Preview of/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument()
  })

  it('offers a retry that fetches the file again', async () => {
    const fetchMock = global.fetch
      .mockRejectedValueOnce(new Error('Network is down'))
      .mockResolvedValue(jsonResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' })))
    render(<DocumentViewerModal open doc={PDF_DOC} applicationId={9} onClose={() => {}} />)

    expect(await screen.findByText('Network is down')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByTitle('Preview of PSA Birth Certificate')
  })

  it('revokes the blob URL when the dialog leaves the screen', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    )
    const view = render(
      <DocumentViewerModal open doc={PDF_DOC} applicationId={9} onClose={() => {}} />
    )
    await screen.findByTitle('Preview of PSA Birth Certificate')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })

  it('fetches nothing while closed', () => {
    render(
      <DocumentViewerModal open={false} doc={null} applicationId={9} onClose={() => {}} />
    )
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
