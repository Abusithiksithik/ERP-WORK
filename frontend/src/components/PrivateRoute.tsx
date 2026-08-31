import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Props { allowedRoles?: string[]; }

const PrivateRoute: React.FC<Props> = ({ allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <div className="loading-spinner"><div className="spinner"></div></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return <Navigate to="/students" replace />;
  return <Outlet />;
};

export default PrivateRoute;
