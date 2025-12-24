
import React, { useState } from 'react';
import { AuthMode } from '../types';
import { Button, Card, Input, Logo } from './ui';

interface AuthPageProps {
  onAuthSuccess: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setMessage('');
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }

    if (mode === 'signup') {
      // Check if user already exists
      const existingUser = localStorage.getItem(username);
      if (existingUser) {
        setError('User already exists. Please log in.');
        return;
      }

      // Save user to localStorage
      // In a real app, NEVER store passwords in plain text.
      localStorage.setItem(username, JSON.stringify({ password }));

      setMessage('Successfully registered! Please log in.');
      setMode('login');
      // Optional: clear fields
      // setUsername('');
      // setPassword('');
    } else {
      // Login Mode
      const storedData = localStorage.getItem(username);

      if (!storedData) {
        setError('User not found. Please sign up first.');
        return;
      }

      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.password !== password) {
          setError('Invalid password.');
          return;
        }
        // Success
        onAuthSuccess();
      } catch (err) {
        console.error("Error parsing user data", err);
        setError('Error reading user data. Please sign up again.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 bg-[radial-gradient(circle_at_top,_#1e293b,_#0f172a)]">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo className="h-16 w-16 text-indigo-400" />
        </div>
        <h1 className="text-3xl font-bold text-center text-slate-100 mb-2">Welcome to InterviewVault</h1>
        <p className="text-center text-slate-400 mb-8">Your personal AI-powered interview coach.</p>
        <Card>
          <h2 className="text-xl font-semibold text-center text-slate-200 mb-6">
            {mode === 'login' ? 'Log In' : 'Sign Up'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            {message && <p className="text-green-400 text-sm text-center">{message}</p>}
            <Input
              id="username"
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., alex_jones"
              required
            />
            <Input
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <Button type="submit" className="w-full !py-3">
              {mode === 'login' ? 'Log In' : 'Sign Up'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button onClick={toggleMode} className="font-semibold text-indigo-400 hover:text-indigo-300 ml-1">
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
