'use client';
import { useFacility, type ViewType } from 'src/context/FacilityContext';
import FacilitySelector from './FacilitySelector';
import { useState, useEffect } from 'react';
import { createClient } from 'src/app/utils/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

interface UserProfile {
  full_name: string | null;
  role: string;
}

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps = {}) {
  const {
    selectedFacilityId,
    setSelectedFacilityId,
    currentView,
    setCurrentView,
    facilityList,
  } = useFacility();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setProfile({ full_name: profileData.full_name, role: profileData.role });
      }
    };
    loadProfile();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
  };

  const isMasterView = selectedFacilityId === 'all' || !selectedFacilityId;

  const navItem = (label: string, view: ViewType, disabled = false) => {
    const isActive = currentView === view;
    return (
      <button
        onClick={() => {
          if (!disabled) {
            setCurrentView(view);
            onNavigate?.();
          }
        }}
        disabled={disabled}
        className={`w-full text-left p-3 rounded-xl font-bold transition-all border min-h-[44px] ${
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

  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'User';

  return (
    <aside className="w-64 border-r border-gray-800 flex flex-col bg-black">
      <div className="p-6 border-b border-gray-800/60">
        <BrandLogo size="sm" showWordmark />
      </div>

      {/* facilityList comes from FacilityContext — always up-to-date after add/archive */}
      <FacilitySelector
        facilities={facilityList}
        selectedFacilityId={selectedFacilityId}
        onSelect={(id) => {
          setSelectedFacilityId(id);
          if (id === 'all') setCurrentView('overview');
          onNavigate?.();
        }}
      />

      <nav className="flex-1 p-4 space-y-2 mt-4">
        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4 px-2">
          Navigation
        </div>
        {navItem('Executive Overview', 'overview')}
        {navItem('Personnel Vault', 'personnel', isMasterView)}
        {navItem('Document Center', 'documents', isMasterView)}
        {navItem('Renewals & Alerts', 'renewals', isMasterView)}
        {navItem('Action Plans', 'corrective_actions', isMasterView)}
        {navItem('Operational Blueprints', 'blueprints', isMasterView)}
        {navItem(isMasterView ? '👥 Team Settings' : '⚙️ Facility Settings', 'settings')}
        {navItem('Audit Trail', 'audit_logs')}

        {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
          <div className="pt-3 mt-3 border-t border-gray-800">
            <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3 px-2">
              Platform Admin
            </div>
            <Link
              href="/admin"
              onClick={() => onNavigate?.()}
              className="w-full text-left p-3 rounded-xl font-bold transition-all border flex items-center gap-2 text-indigo-400 border-indigo-500/20 bg-indigo-600/10 hover:bg-indigo-600/20 hover:border-indigo-500/40 min-h-[44px]"
            >
              Admin Control Center
            </Link>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 p-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="text-xs min-w-0 flex-1">
            <p className="font-bold text-white truncate">
              {profile?.full_name ?? 'Loading…'}
            </p>
            <p className="text-gray-500">{roleLabel}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-gray-600 hover:text-gray-400 transition-colors text-xs shrink-0"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}
