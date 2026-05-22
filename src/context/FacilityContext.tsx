'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from 'src/app/utils/supabase/client';

export type ViewType =
  | 'overview'
  | 'personnel'
  | 'documents'
  | 'blueprints'
  | 'settings'
  | 'audit_logs';

export interface FacilityListItem {
  id: string;
  name: string;
}

type FacilityContextType = {
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  /** Org-scoped active facility list — shared between Sidebar and Dashboard. */
  facilityList: FacilityListItem[];
  /** Re-fetch the facility list (call after add / archive). */
  refreshFacilities: () => Promise<void>;
};

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export function FacilityProvider({ children }: { children: React.ReactNode }) {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('all');
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [facilityList, setFacilityList] = useState<FacilityListItem[]>([]);

  const refreshFacilities = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.org_id) return;

      const { data: facilities } = await supabase
        .from('facilities')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .eq('is_active', true)
        .order('name');

      setFacilityList(facilities ?? []);
    } catch (err) {
      console.error('Failed to refresh facility list:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void refreshFacilities();
  }, [refreshFacilities]);

  return (
    <FacilityContext.Provider
      value={{
        selectedFacilityId,
        setSelectedFacilityId,
        currentView,
        setCurrentView,
        facilityList,
        refreshFacilities,
      }}
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
