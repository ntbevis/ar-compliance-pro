'use client';
import React, { createContext, useContext, useState } from 'react';

// Define the available view tabs
export type ViewType = 'overview' | 'personnel' | 'documents' | 'audit_logs';

type FacilityContextType = {
  selectedFacilityId: string; // 'all' or a specific UUID
  setSelectedFacilityId: (id: string) => void;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
};

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const [selectedFacilityId, setSelectedFacilityId] = useState('all');
  const [currentView, setCurrentView] = useState<ViewType>('overview');

  return (
    <FacilityContext.Provider 
      value={{ selectedFacilityId, setSelectedFacilityId, currentView, setCurrentView }}
    >
      {children}
    </FacilityContext.Provider>
  );
}

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) throw new Error('useFacility must be used within a FacilityProvider');
  return context;
};