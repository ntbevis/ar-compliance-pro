'use client';

import type { Facility } from '@/lib/types';

interface FacilitySelectorProps {
  facilities?: Pick<Facility, 'id' | 'name'>[];
  selectedFacilityId: string | null;
  onSelect: (value: string) => void;
}

export default function FacilitySelector({ facilities, selectedFacilityId, onSelect }: FacilitySelectorProps) {
  return (
    <div className="p-4 border-b border-gray-800">
      <label className="text-xs uppercase text-gray-500 font-bold tracking-widest">Select Facility</label>
      <select
        value={selectedFacilityId || 'all'}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full mt-2 bg-black text-white border border-gray-700 rounded-md p-2 cursor-pointer focus:outline-none focus:border-blue-500"
      >
        {/* Forcing explicit dark charcoal text on white backgrounds inside the expanded native Safari menus */}
        <option value="all" className="text-slate-900 bg-white">
          Master View (All Facilities)
        </option>
        {(facilities ?? []).map((f) => (
          <option key={f.id} value={f.id} className="text-slate-900 bg-white">
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}