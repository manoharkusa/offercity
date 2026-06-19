import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const handleLogout = () => { logout(); navigate('/login'); close(); };

  return (
    <header className="navbar">
      <Link to="/" className="brand" onClick={close}>🔥 OfferCity</Link>

      <button className="hamburger" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
        {open ? '✕' : '☰'}
      </button>

      <nav className={open ? 'nav-open' : ''}>
        <Link to="/" onClick={close}>Nearby Offers</Link>
        {user && <Link to="/saved" onClick={close}>Saved</Link>}
        {user?.role === 'shop_owner' && <Link to="/shop-dashboard" onClick={close}>My Shop</Link>}
        {user?.role === 'admin' && <Link to="/admin" onClick={close}>Admin</Link>}
        {user ? (
          <>
            <span className="nav-user">Hi, {user.name}</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" onClick={close}>Login</Link>
            <Link to="/register" onClick={close}>Register</Link>
          </>
        )}
      </nav>

      {/* Backdrop to close menu on outside tap */}
      {open && <div className="nav-backdrop" onClick={close} />}
    </header>
  );
}
