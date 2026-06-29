import { useNavigate } from 'react-router-dom';

// Reusable "← Back" button for detail pages (desktop + mobile).
// Goes to the previous page; falls back to home if there's no history.
export default function BackButton({ fallback = '/', label = 'Back', style = {} }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback);
  };
  return (
    <button type="button" className="back-btn" onClick={goBack} style={style} aria-label="Go back">
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
