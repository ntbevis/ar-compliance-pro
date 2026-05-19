import { FacilityProvider } from 'src/context/FacilityContext';
import Sidebar from 'src/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FacilityProvider>
      <div className="flex min-h-screen bg-black text-white">
        {/* The Sidebar is fixed to the left */}
        <Sidebar />
        
        {/* The Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </FacilityProvider>
  );
}