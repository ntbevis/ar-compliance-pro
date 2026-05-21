'use client';
import React, { createContext, useContext, useState } from 'react';

/**
 * Available view tabs in the dashboard shell.
 * - overview:    Executive Overview / Twin-Score Dashboard
 * - personnel:   Personnel Vault (staff & licensing checklist)
 * - documents:   Document Center (audit trail of uploads)
 * - blueprints:  Operational Blueprints & Daily Guidelines
 * - settings:    Facility Settings (scope toggles)
 * - audit_logs:  Compliance audit trail
 */
export type ViewType =
  | 'overview'
  | 'personnel'
  | 'documents'
  | 'blueprints'
  | 'settings'
  | 'audit_logs';

type FacilityContextType = {
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
};

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('all');
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
