import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import useNearbyAlerts from './hooks/useNearbyAlerts';
import Navbar from './components/Navbar';
import LoginNudge from './components/LoginNudge';
import WelcomeGate from './components/WelcomeGate';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';

// Heavy pages loaded only when visited — cuts initial bundle from 459KB → ~120KB
const OfferDetails    = lazy(() => import('./pages/OfferDetails'));
const ShopDashboard   = lazy(() => import('./pages/ShopDashboard'));
const AdminDashboard  = lazy(() => import('./pages/AdminDashboard'));
const BDODashboard    = lazy(() => import('./pages/BDODashboard'));
const SavedOffers     = lazy(() => import('./pages/SavedOffers'));
const ShopPage        = lazy(() => import('./pages/ShopPage'));
const SmsLanding      = lazy(() => import('./pages/SmsLanding'));

function PageLoader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:36, height:36, border:'4px solid #f0e6d6', borderTopColor:'#e65100', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <div style={{ color:'#e65100', fontSize:13, fontWeight:600 }}>Loading…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function PrivateRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function NearbyAlerts() {
  useNearbyAlerts();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NearbyAlerts />
        <Navbar />
        <LoginNudge />
        <WelcomeGate />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"              element={<Home />} />
            <Route path="/login"         element={<Login />} />
            <Route path="/register"      element={<Register />} />
            <Route path="/offers/:id"    element={<OfferDetails />} />
            <Route path="/o/:id"         element={<SmsLanding />} />
            <Route path="/saved"         element={<PrivateRoute><SavedOffers /></PrivateRoute>} />
            <Route path="/shop-dashboard" element={<PrivateRoute roles={['shop_owner','admin']}><ShopDashboard /></PrivateRoute>} />
            <Route path="/admin"         element={<PrivateRoute roles={['admin']}><AdminDashboard /></PrivateRoute>} />
            <Route path="/bdo"           element={<PrivateRoute roles={['bdo']}><BDODashboard /></PrivateRoute>} />
            <Route path="/shop/:slug"    element={<ShopPage />} />
            <Route path="/:city/:slug"   element={<ShopPage />} />
          </Routes>
        </Suspense>
        <Footer />
      </BrowserRouter>
    </AuthProvider>
  );
}
