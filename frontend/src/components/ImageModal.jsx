export default function ImageModal({ src, alt, onClose }) {
  if (!src) return null;
  return (
    <div className="image-modal-backdrop" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="image-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <img src={src} alt={alt} className="image-modal-img" />
      </div>
    </div>
  );
}