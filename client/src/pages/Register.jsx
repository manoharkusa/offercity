import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', mobile: '', role: 'user' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Full name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!form.password.trim()) return setError('Password is required');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    try {
      const user = await register(form);
      if (user.role === 'shop_owner') navigate('/shop-dashboard');
      else navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div className="form-page">
      <h2>Create Account</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Full Name</label>
          <input placeholder="Your name"
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="you@email.com"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Mobile</label>
          <input placeholder="10-digit mobile"
            value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="Min 6 characters"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="form-group">
          <label>I am a</label>
          <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="user">Customer</option>
            <option value="shop_owner">Shop Owner / Merchant</option>
          </select>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button className="btn-primary" type="submit">Register</button>
      </form>
      <p className="form-link">Already registered? <Link to="/login">Login</Link></p>
    </div>
  );
}
