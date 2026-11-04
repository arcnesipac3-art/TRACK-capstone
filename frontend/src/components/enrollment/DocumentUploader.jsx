import { useRef, useState } from 'react'
import Icon from '../Icon'
import { DOCUMENT_FILE_ACCEPT, documentFileError } from '../../utils/enrollment'
import './DocumentUploader.css'

/**
 * One upload slot for an enrollment document requirement.
 *
 * The native input carries the accessible name and stays in the tab order;
 * it is visually hidden and the house button style is applied to its label,
 * so clicking "Choose file" is the browser opening the picker rather than a
 * synthetic click. The same area accepts a dropped file. The server still
 * checks extension, magic bytes and size on upload — the check here only
 * moves that message in front of the request.
 */
export default function DocumentUploader({
  id,
  docName,
  hasFile,
  busy,
  error,
  disabled,
  onSelect,
}) {
  // A drop zone made of child elements fires dragleave for every one of them,
  // so the highlight follows a depth counter instead of the raw events.
  const depthRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState(null)

  const blocked = Boolean(busy) || Boolean(disabled)
  const shown = localError || error

  function take(file) {
    if (blocked || !file) return
    const problem = documentFileError(file)
    setLocalError(problem)
    if (!problem) onSelect(file)
  }

  return (
    <div
      className={`doc-drop${dragging ? ' is-drag' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        depthRef.current += 1
        if (!blocked) setDragging(true)
      }}
      onDragOver={(e) => {
        // Without this the browser refuses the drop.
        e.preventDefault()
      }}
      onDragLeave={() => {
        depthRef.current = Math.max(0, depthRef.current - 1)
        if (depthRef.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        depthRef.current = 0
        setDragging(false)
        take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0])
      }}
    >
      <input
        type="file"
        id={id}
        accept={DOCUMENT_FILE_ACCEPT}
        aria-label={`Upload ${docName}`}
        disabled={blocked}
        className="sr-only"
        onChange={(e) => {
          const input = e.target
          const file = input.files && input.files[0]
          // Clear the value so picking the SAME file again after a failed
          // upload still fires change.
          input.value = ''
          take(file)
        }}
      />
      <label
        htmlFor={id}
        className={`btn btn-secondary btn-sm doc-drop-cta${blocked ? ' btn-disabled' : ''}`}
      >
        <Icon name="file" size={14} />
        {hasFile ? 'Replace file' : 'Choose file'}
      </label>
      <span className="doc-drop-text">
        {busy ? 'Uploading…' : 'or drop the file here'}
      </span>
      <span className="doc-drop-hint">PDF, JPG, PNG, WEBP, DOC or DOCX · up to 10 MB</span>
      {shown && (
        <span className="doc-drop-error" role="alert">
          <Icon name="info" size={13} />
          {shown}
        </span>
      )}
    </div>
  )
}
