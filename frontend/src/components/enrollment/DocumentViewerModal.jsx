import { useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import ErrorMessage from '../ErrorMessage'
import Icon from '../Icon'
import InlineLoader from '../loading/InlineLoader'
import StatusBadge from '../StatusBadge'
import { API_BASE } from '../../services/api'
import {
  documentDownloadPath,
  documentStatus,
  downloadAuthorizedFile,
  fetchAuthorizedBlob,
  viewableDocument,
} from '../../utils/enrollment'
import './DocumentViewerModal.css'

const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3]

/**
 * Read an enrollment document without leaving the review screen.
 *
 * The file is fetched through the same authorized endpoint the Download
 * button uses — the bytes never get a public URL — and rendered from a blob
 * object URL: a PDF in an `<iframe>` (the browser's own viewer brings its
 * zoom and page controls), an image in an `<img>` with a zoom step of our
 * own. A Word file cannot be rendered by a browser at all, so it keeps the
 * Download action instead of pretending to preview.
 */
export default function DocumentViewerModal({
  open,
  doc,
  applicationId,
  onClose,
  actions,
}) {
  const [session, setSession] = useState(null)
  const [zoomIndex, setZoomIndex] = useState(0)
  const [attempt, setAttempt] = useState(0)
  // The live blob URL. It is revoked when the next one is made and when this
  // dialog unmounts — not when `open` goes false, because the panel is still
  // painted for the length of its exit keyframe and must not blank mid-fade.
  const urlRef = useRef(null)

  // Opening a different document resets the session as a render-phase update,
  // so the effect below only ever runs the request and settles it.
  const docId = open && doc ? doc.id : null
  if (docId !== null && session?.docId !== docId) {
    setSession({ docId, status: 'loading' })
  }

  useEffect(() => {
    if (docId === null) return undefined
    let cancelled = false
    const filename = doc?.original_filename
    fetchAuthorizedBlob(API_BASE, documentDownloadPath(applicationId, docId))
      .then((blob) => {
        if (cancelled) return
        const view = viewableDocument(filename)
        // Re-stamp the blob when Django could not guess its type: a PDF
        // arriving as octet-stream opens inside the frame as a download
        // prompt instead of a rendered page.
        const typed =
          view && blob.type !== view.mime ? new Blob([blob], { type: view.mime }) : blob
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = URL.createObjectURL(typed)
        setSession((prev) =>
          prev?.docId === docId
            ? { ...prev, status: 'ready', url: urlRef.current, view }
            : prev
        )
      })
      .catch((err) => {
        if (cancelled) return
        setSession((prev) =>
          prev?.docId === docId ? { ...prev, status: 'error', message: err.message } : prev
        )
      })
    return () => {
      cancelled = true
    }
    // `doc?.original_filename` is a dependency because the render mode is
    // decided from it, and a replaced file can change kind under the same id.
  }, [docId, applicationId, doc?.original_filename, attempt])

  // Leaving the screen entirely takes the blob URL with it.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    },
    []
  )

  const ready = session?.status === 'ready' ? session : null
  const failed = session?.status === 'error' ? session : null
  const path = doc ? documentDownloadPath(applicationId, doc.id) : null

  return (
    <Modal
      open={open}
      title={doc ? doc.name : 'Document'}
      onClose={onClose}
      width={920}
      footer={
        <>
          {doc && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => downloadAuthorizedFile(API_BASE, path, doc.original_filename)}
            >
              <Icon name="download" size={14} />
              Download
            </Button>
          )}
          {actions}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="doc-viewer">
        {doc && (
          <div className="doc-viewer-bar">
            <span className="doc-viewer-file" title={doc.original_filename}>
              {doc.original_filename || <span className="subtle">No file</span>}
            </span>
            <StatusBadge
              label={doc.status_display || documentStatus(doc.status).label}
              tone={documentStatus(doc.status).tone}
            />
          </div>
        )}

        {session?.status === 'loading' && (
          <div className="doc-viewer-state">
            <InlineLoader label="Opening document…" size="lg" />
          </div>
        )}

        {failed && (
          <div className="doc-viewer-state">
            <ErrorMessage
              error={failed.message}
              title="The document could not be opened"
              onRetry={() => {
                setSession({ docId, status: 'loading' })
                setAttempt((n) => n + 1)
              }}
            />
          </div>
        )}

        {ready && !ready.view && (
          <div className="doc-viewer-state">
            <p>
              This is a Word document, which the browser cannot display. Use
              Download to open it in Word, then come back to verify it.
            </p>
          </div>
        )}

        {ready?.view?.kind === 'pdf' && (
          <iframe
            className="doc-viewer-frame"
            src={ready.url}
            title={`Preview of ${doc?.name || 'document'}`}
          />
        )}

        {ready?.view?.kind === 'image' && (
          <>
            <div className="doc-viewer-image-wrap">
              <img
                className="doc-viewer-image"
                src={ready.url}
                alt={`Preview of ${doc?.name || 'document'}`}
                style={{ transform: `scale(${ZOOM_LEVELS[zoomIndex]})` }}
              />
            </div>
            <div className="doc-viewer-zoom">
              <Button
                variant="secondary"
                size="xs"
                disabled={zoomIndex === 0}
                onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                aria-label="Zoom out"
              >
                −
              </Button>
              <span className="subtle">{Math.round(ZOOM_LEVELS[zoomIndex] * 100)}%</span>
              <Button
                variant="secondary"
                size="xs"
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
                aria-label="Zoom in"
              >
                +
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
