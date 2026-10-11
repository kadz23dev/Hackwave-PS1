import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getStoredUser, UserSession } from '../api/client';

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<void>;
  signup: (email: string, password?: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: async () => {},
  signup: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(getStoredUser);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const login = async (email: string, password?: string) => {
    const res = await api.login({ email, password });
    setUser(res.user);
  };

  const signup = async (email: string, password?: string, name?: string) => {
    const res = await api.signup({ email, password, name });
    setUser(res.user);
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user?.loggedIn,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
