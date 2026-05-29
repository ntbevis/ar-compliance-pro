'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentComplianceStatus, IdentifiedGap } from '@/lib/types';

// =============================================================================
// COMPLIANCE SCORE WHEEL
// An interactive SVG donut that breaks the twin-score down into status buckets.
// Each arc's length is the literal *weight* that bucket contributes to the
// category (rules in bucket / total scored rules). Hover (desktop) or tap
// (mobile, via the legend or a segment) reveals the bucket's weight + impact.
// Pure SVG + Tailwind + a single requestAnimationFrame tween — no dependencies.
// =============================================================================

// The status buckets a scored rule can fall into, in display/stack order.
type BucketKey = 'satisfied' | 'expiring_soon' | 'expired' | 'pending_review' | 'missing';

interface BucketMeta {
  label: string;
  // Solid token for legend dots / focus rings.
  solid: string;
  // Gradient stops for the arc.
  from: string;
  to: string;
  // Whether a rule in this bucket currently counts toward the readiness score.
  countsTowardScore: boolean;
}

// Palette stays inside the families already used by the dashboard (emerald /
// amber / rose / sky / slate) so the wheel matches the existing design system.
const BUCKET_META: Record<BucketKey, BucketMeta> = {
  satisfied: {
    label: 'Verified',
    solid: '#10b981',
    from: '#34d399',
    to: '#059669',
    countsTowardScore: true,
  },
  expiring_soon: {
    label: 'Expiring Soon',
    solid: '#f59e0b',
    from: '#fbbf24',
    to: '#d97706',
    countsTowardScore: true,
  },
  expired: {
    label: 'Expired',
    solid: '#f43f5e',
    from: '#fb7185',
    to: '#e11d48',
    countsTowardScore: true,
  },
  pending_review: {
    label: 'Pending Review',
    solid: '#0ea5e9',
    from: '#38bdf8',
    to: '#0284c7',
    countsTowardScore: false,
  },
  missing: {
    label: 'Not Provided',
    solid: '#94a3b8',
    from: '#cbd5e1',
    to: '#64748b',
    countsTowardScore: false,
  },
};

const BUCKET_ORDER: BucketKey[] = [
  'satisfied',
  'expiring_soon',
  'expired',
  'pending_review',
  'missing',
];

// Classify a gap into one of the visual buckets. An optimistically-completed
// gap is always treated as verified so the wheel reacts instantly to uploads.
function bucketForGap(gap: IdentifiedGap): BucketKey {
  if (gap.completed) return 'satisfied';
  const status: DocumentComplianceStatus = gap.compliance_status;
  switch (status) {
    case 'satisfied':
      return 'satisfied';
    case 'expiring_soon':
      return 'expiring_soon';
    case 'expired':
      return 'expired';
    case 'pending_review':
      return 'pending_review';
    case 'missing':
    default:
      return 'missing';
  }
}

interface Segment {
  key: BucketKey;
  count: number;
  // Fraction of the whole ring (0–1) this bucket occupies.
  fraction: number;
  // Weight as a whole-number percentage, for display.
  weightPct: number;
}

// ── Geometry ────────────────────────────────────────────────────────────────
const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const RADIUS = 78;
const CIRC = 2 * Math.PI * RADIUS;
const BASE_STROKE = 18;
const ACTIVE_STROKE = 26;
// Visual separation between adjacent arcs, in user units along the path.
const GAP = 5;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

export interface ComplianceScoreWheelProps {
  label: string;
  emoji: string;
  /** Authoritative readiness score (0–100), already computed upstream. */
  score: number;
  description: string;
  /** Scored gaps for THIS category only. Drives the bucket breakdown. */
  gaps: IdentifiedGap[];
}

export default function ComplianceScoreWheel({
  label,
  emoji,
  score,
  description,
  gaps,
}: ComplianceScoreWheelProps) {
  const reducedMotion = useReducedMotion();

  // ── Build segments from the gap list ──────────────────────────────────────
  const { segments, total, verified } = useMemo(() => {
    const counts: Record<BucketKey, number> = {
      satisfied: 0,
      expiring_soon: 0,
      expired: 0,
      pending_review: 0,
      missing: 0,
    };
    for (const gap of gaps) counts[bucketForGap(gap)] += 1;

    const totalRules = gaps.length;
    const segs: Segment[] = BUCKET_ORDER.filter((k) => counts[k] > 0).map((key) => ({
      key,
      count: counts[key],
      fraction: totalRules > 0 ? counts[key] / totalRules : 0,
      weightPct: totalRules > 0 ? Math.round((counts[key] / totalRules) * 100) : 0,
    }));

    const verifiedCount = BUCKET_ORDER.filter((k) => BUCKET_META[k].countsTowardScore).reduce(
      (sum, k) => sum + counts[k],
      0
    );

    return { segments: segs, total: totalRules, verified: verifiedCount };
  }, [gaps]);

  // ── Animated tween (progress sweep + score count-up) ──────────────────────
  const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
  const [displayScore, setDisplayScore] = useState(reducedMotion ? score : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(1);
      setDisplayScore(score);
      return;
    }

    const duration = 1000;
    const start = performance.now();
    const fromScore = displayScore;
    // easeOutCubic for a satisfying, decelerating fill.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = ease(t);
      setProgress(eased);
      setDisplayScore(Math.round(fromScore + (score - fromScore) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    // Restart the sweep whenever the score changes (e.g. optimistic updates).
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // displayScore intentionally omitted: we snapshot it as the tween's origin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, reducedMotion]);

  // ── Interaction state ─────────────────────────────────────────────────────
  const [hoveredKey, setHoveredKey] = useState<BucketKey | null>(null);
  const [pinnedKey, setPinnedKey] = useState<BucketKey | null>(null);
  const activeKey = pinnedKey ?? hoveredKey;
  const activeSegment = activeKey ? segments.find((s) => s.key === activeKey) ?? null : null;

  const tone =
    score >= 80
      ? { ring: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700', glow: 'rgba(16,185,129,0.25)' }
      : score >= 50
      ? { ring: 'text-amber-600', chip: 'bg-amber-50 text-amber-700', glow: 'rgba(245,158,11,0.22)' }
      : { ring: 'text-rose-600', chip: 'bg-rose-50 text-rose-700', glow: 'rgba(244,63,94,0.22)' };

  const hasRules = total > 0;
  const gradientId = useMemo(
    () => `wheel-grad-${label.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
    [label]
  );

  // Pre-compute the cumulative start offset (in path units) for each segment.
  let cumulative = 0;
  const placed = segments.map((seg) => {
    const startOffset = cumulative * CIRC;
    cumulative += seg.fraction;
    return { seg, startOffset, fullLen: seg.fraction * CIRC };
  });

  const clearPinned = () => setPinnedKey(null);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
        <span className="mr-1.5" aria-hidden>
          {emoji}
        </span>
        {label}
      </h3>

      {/* ── The wheel ──────────────────────────────────────────────────────── */}
      <div
        className="relative w-full max-w-[15rem] aspect-square select-none"
        onClick={clearPinned}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="w-full h-full -rotate-90"
          role="img"
          aria-label={`${label}: ${score}% ready. ${verified} of ${total} requirements verified.`}
        >
          <defs>
            {segments.map((seg) => (
              <linearGradient
                key={seg.key}
                id={`${gradientId}-${seg.key}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor={BUCKET_META[seg.key].from} />
                <stop offset="100%" stopColor={BUCKET_META[seg.key].to} />
              </linearGradient>
            ))}
          </defs>

          {/* Track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={BASE_STROKE}
          />

          {/* When there are no scored rules, render a full neutral-positive ring. */}
          {!hasRules && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={BASE_STROKE}
              strokeDasharray={`${CIRC * progress} ${CIRC}`}
              strokeLinecap="round"
            />
          )}

          {placed.map(({ seg, startOffset, fullLen }) => {
            const isActive = activeKey === seg.key;
            const isDimmed = activeKey !== null && !isActive;
            // Uniform clockwise sweep: reveal up to `progress` of the full ring.
            const revealed = Math.max(0, Math.min(fullLen, progress * CIRC - startOffset));
            // Leave a small gap at the trailing edge when multiple segments exist.
            const capped = segments.length > 1 ? Math.max(0, revealed - GAP) : revealed;
            return (
              <circle
                key={seg.key}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={`url(#${gradientId}-${seg.key})`}
                strokeWidth={isActive ? ACTIVE_STROKE : BASE_STROKE}
                strokeDasharray={`${capped} ${CIRC}`}
                strokeDashoffset={-startOffset}
                strokeLinecap="butt"
                className="cursor-pointer transition-[stroke-width,opacity] duration-300 ease-out"
                style={{ opacity: isDimmed ? 0.35 : 1 }}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedKey((prev) => (prev === seg.key ? null : seg.key));
                }}
              />
            );
          })}
        </svg>

        {/* ── Center readout (rotates back to upright) ─────────────────────── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6">
          {activeSegment ? (
            <div className="animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: BUCKET_META[activeSegment.key].solid }}
                  aria-hidden
                />
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {BUCKET_META[activeSegment.key].label}
                </span>
              </div>
              <div className="text-4xl font-black text-slate-900 leading-none">
                {activeSegment.weightPct}%
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-tight">
                {activeSegment.count} of {total} requirement{total !== 1 ? 's' : ''}
              </p>
              <p
                className={`text-[11px] font-semibold mt-1 leading-tight ${
                  BUCKET_META[activeSegment.key].countsTowardScore
                    ? 'text-emerald-600'
                    : 'text-rose-500'
                }`}
              >
                {BUCKET_META[activeSegment.key].countsTowardScore
                  ? `Securing ${activeSegment.weightPct} pts`
                  : `${activeSegment.weightPct} pts at stake`}
              </p>
            </div>
          ) : (
            <div
              className="animate-in fade-in duration-200"
              style={{ filter: `drop-shadow(0 4px 14px ${tone.glow})` }}
            >
              <div className={`text-5xl font-black leading-none ${tone.ring}`}>
                {displayScore}
                <span className="text-2xl align-top">%</span>
              </div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-1.5">
                Ready
              </p>
              {hasRules && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {verified} of {total} verified
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Legend (also the touch-interaction surface on mobile) ──────────── */}
      {hasRules ? (
        <div className="w-full mt-5 space-y-1.5">
          {segments.map((seg) => {
            const meta = BUCKET_META[seg.key];
            const isActive = activeKey === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  setPinnedKey((prev) => (prev === seg.key ? null : seg.key));
                }}
                aria-pressed={isActive}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors min-h-[40px] ${
                  isActive ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: meta.solid }}
                  aria-hidden
                />
                <span className="text-sm font-medium text-slate-700 flex-1 truncate">
                  {meta.label}
                </span>
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  {seg.count}
                </span>
                <span className="text-xs font-black text-slate-900 tabular-nums w-11 text-right">
                  {seg.weightPct}%
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400 mt-5">No scored requirements in this category.</p>
      )}

      <p className="text-xs text-slate-500 mt-4 max-w-[16rem]">{description}</p>
    </div>
  );
}
