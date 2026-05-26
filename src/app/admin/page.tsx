import Link from 'next/link';

interface AdminCard {
  href: string;
  icon: string;
  title: string;
  description: string;
  badge?: string;
  accentClass: string;
  borderClass: string;
}

const ADMIN_SECTIONS: AdminCard[] = [
  {
    href: '/admin/requests',
    icon: '📋',
    title: 'Registration Requests',
    description:
      'Review and action inbound platform access requests. Approve leads to create an organization and send an invitation, or deny to close the request.',
    badge: 'Lead Management',
    accentClass: 'text-blue-400',
    borderClass: 'border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-600/5',
  },
  {
    href: '/admin/review-queue',
    icon: '🗂️',
    title: 'Document Review Queue',
    description:
      'Inspect documents submitted by facility operators for human review. Approve to satisfy compliance requirements or reject with a reason logged to the audit trail.',
    badge: 'Compliance',
    accentClass: 'text-indigo-400',
    borderClass: 'border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-600/5',
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 md:p-12">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-14">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-indigo-600/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 text-2xl shrink-0">
              🛡️
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight">Admin Control Center</h1>
              <p className="text-slate-400 text-sm mt-1">
                Platform-level administration — restricted to authorized personnel only.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm font-medium transition-colors text-slate-300"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Section Cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          {ADMIN_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={`group block bg-slate-900/50 border rounded-2xl p-8 backdrop-blur-sm transition-all duration-200 ${section.borderClass}`}
            >
              <div className="flex items-start gap-5">
                <div className="text-4xl shrink-0 mt-0.5">{section.icon}</div>
                <div className="min-w-0">
                  {section.badge && (
                    <span className={`inline-block text-[10px] font-black uppercase tracking-widest mb-2 ${section.accentClass}`}>
                      {section.badge}
                    </span>
                  )}
                  <h2 className={`text-xl font-black mb-2 group-hover:${section.accentClass} transition-colors`}>
                    {section.title}
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">{section.description}</p>
                </div>
              </div>
              <div className={`mt-6 flex items-center gap-2 text-sm font-bold ${section.accentClass}`}>
                Open <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-14 text-center text-xs text-slate-700 font-medium uppercase tracking-widest">
          All admin actions are logged in the audit trail
        </p>
      </div>
    </div>
  );
}
