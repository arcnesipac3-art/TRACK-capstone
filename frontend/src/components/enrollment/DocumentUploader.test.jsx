import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DocumentUploader from './DocumentUploader'

function renderUploader(overrides = {}) {
  const onSelect = vi.fn()
  const view = render(
    <DocumentUploader
      id="wiz-doc-5"
      docName="Birth Certificate"
      hasFile={false}
      onSelect={onSelect}
      {...overrides}
    />
  )
  return { view, onSelect }
}

function dropFiles(file) {
  fireEvent.dragEnter(screen.getByLabelText('Upload Birth Certificate').parentElement, {
    dataTransfer: { files: [file] },
  })
  fireEvent.drop(screen.getByLabelText('Upload Birth Certificate').parentElement, {
    dataTransfer: { files: [file] },
  })
}

const pdf = () =>
  new File(['%PDF-1.4'], 'birth-certificate.pdf', { type: 'application/pdf' })

describe('DocumentUploader', () => {
  it('keeps the native input as the named control', () => {
    renderUploader()
    const input = screen.getByLabelText('Upload Birth Certificate')
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute(
      'accept',
      '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'
    )
    expect(screen.getByText('Choose file')).toBeInTheDocument()
  })

  it('takes a file chosen from the picker', async () => {
    const { onSelect } = renderUploader()
    await userEvent.upload(screen.getByLabelText('Upload Birth Certificate'), pdf())
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'birth-certificate.pdf' }))
  })

  it('takes a dropped file', () => {
    const { onSelect } = renderUploader()
    dropFiles(pdf())
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('names a dropped file the endpoint would reject', () => {
    const { onSelect } = renderUploader()
    dropFiles(new File(['notes'], 'notes.txt', { type: 'text/plain' }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/PDF, JPG, PNG, WEBP, DOC or DOCX/i)
  })

  it('stops a file larger than the server allows before uploading it', () => {
    const { onSelect } = renderUploader()
    const huge = new File(['x'], 'scan.pdf', { type: 'application/pdf' })
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 })
    dropFiles(huge)
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/over the 10 MB limit/i)
  })

  it('highlights while a file is over the zone and settles when it leaves', () => {
    renderUploader()
    const zone = screen.getByLabelText('Upload Birth Certificate').parentElement
    fireEvent.dragEnter(zone, { dataTransfer: { files: [pdf()] } })
    // Moving onto a child element fires dragenter for the child and dragleave
    // for the parent; the highlight must survive that handover.
    fireEvent.dragEnter(zone, { dataTransfer: { files: [pdf()] } })
    expect(zone.className).toContain('is-drag')
    fireEvent.dragLeave(zone)
    expect(zone.className).toContain('is-drag')
    fireEvent.dragLeave(zone)
    expect(zone.className).not.toContain('is-drag')
  })

  it('shows the server failure and stays usable', async () => {
    const { onSelect } = renderUploader({ error: 'Upload failed (400).' })
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed (400).')
    await userEvent.upload(screen.getByLabelText('Upload Birth Certificate'), pdf())
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1))
  })

  it('says so while a file is in flight and refuses a second one', async () => {
    const { onSelect } = renderUploader({ busy: true })
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload Birth Certificate')).toBeDisabled()
    dropFiles(pdf())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('refuses a file while the application does not exist yet', () => {
    const { onSelect } = renderUploader({ disabled: true })
    expect(screen.getByLabelText('Upload Birth Certificate')).toBeDisabled()
    dropFiles(pdf())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('offers to replace a document that already has a file', () => {
    renderUploader({ hasFile: true })
    expect(screen.getByText('Replace file')).toBeInTheDocument()
  })
})
