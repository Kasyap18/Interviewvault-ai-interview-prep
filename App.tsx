
import React, { useState } from 'react';
import { View, UserType } from './types';
import AuthPage from './components/AuthPage';
import UserTypeSelector from './components/UserTypeSelector';
import Dashboard from './components/Dashboard';

const App: React.FC = () => {
  const [view, setView] = useState<View>('auth');
  const [userType, setUserType] = useState<UserType | null>(null);

  const handleAuthSuccess = () => {
    setView('userTypeSelector');
  };

  const handleSelectUserType = (selectedUserType: UserType) => {
    setUserType(selectedUserType);
    setView('dashboard');
  };

  const handleLogout = () => {
    setUserType(null);
    setView('auth');
  };

  const renderView = () => {
    switch (view) {
      case 'auth':
        return <AuthPage onAuthSuccess={handleAuthSuccess} />;
      case 'userTypeSelector':
        return <UserTypeSelector onSelectUserType={handleSelectUserType} />;
      case 'dashboard':
        if (userType) {
          return <Dashboard userType={userType} onLogout={handleLogout} />;
        }
        // Fallback to auth if userType is somehow null
        setView('auth');
        return <AuthPage onAuthSuccess={handleAuthSuccess} />;
      default:
        return <AuthPage onAuthSuccess={handleAuthSuccess} />;
    }
  };

  return <div className="App">{renderView()}</div>;
};

export default App;
