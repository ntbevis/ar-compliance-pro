'use client';
import { useFacility, ViewType } from 'src/context/FacilityContext';
import FacilitySelector from './FacilitySelector';
import { useState, useEffect } from 'react';
import { createClient } from 'src/app/utils/supabase/client';

export default function Sidebar() {
  const { selectedFacilityId, setSelectedFacilityId, currentView, setCurrentView } = useFacility();
  const [facilities, setFacilities] = useState<any[]>([]);

  useEffect(() => {
    const fetchFacilities = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('facilities').select('id, name');
      if (data) setFacilities(data);
    };
    fetchFacilities();
  }, []);

  // Check if user is in Master View
  const isMasterView = selectedFacilityId === 'all' || !selectedFacilityId;

  // Structural helper for clean tab rendering
  const navItem = (label: string, view: ViewType, disabled: boolean = false) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => !disabled && setCurrentView(view)}
        disabled={disabled}
        className={`w-full text-left p-3 rounded-xl font-bold transition-all border ${
          disabled
            ? 'opacity-50 cursor-not-allowed text-gray-600 border-transparent'
            : isActive
            ? 'bg-blue-600/10 text-blue-500 border-blue-600/20'
            : 'text-gray-500 border-transparent hover:bg-gray-900'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <aside className="w-64 border-r border-gray-800 flex flex-col bg-black">
      <div className="p-6">
        <h2 className="text-blue-500 font-black tracking-tighter text-xl italic">AR_GUARD</h2>
      </div>

      <FacilitySelector
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        onSelect={(id) => {
          setSelectedFacilityId(id);
          if (id === 'all') setCurrentView('overview');
        }}
      />

      <nav className="flex-1 p-4 space-y-2 mt-4">
        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4 px-2">Navigation</div>
        {navItem('Executive Overview', 'overview')}
        {navItem('Personnel Vault', 'personnel', isMasterView)}
        {navItem('Document Center', 'documents', isMasterView)}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600" />
          <div className="text-xs">
            <p className="font-bold text-white">Admin User</p>
            <p className="text-gray-500">Settings</p>
          </div>
        </div>
      </div>
    </aside>
  );
}