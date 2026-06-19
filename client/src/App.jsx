import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LeadCapture from './components/LeadCapture';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import OfferDetails from './pages/OfferDetails';
import ShopDashboard from './pages/ShopDashboard';
import AdminDashboard from './pages/AdminDashboard';
import SavedOffers from './pages/SavedOffers';
import ShopPage from './pages/ShopPage';

function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <LeadCapture />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/offers/:id" element={<OfferDetails />} />
          <Route path="/saved" element={<PrivateRoute><SavedOffers /></PrivateRoute>} />
          <Route path="/shop-dashboard" element={<PrivateRoute roles={['shop_owner', 'admin']}><ShopDashboard /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute roles={['admin']}><AdminDashboard /></PrivateRoute>} />
          <Route path="/shop/:slug" element={<ShopPage />} />
          <Route path="/:city/:slug" element={<ShopPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
