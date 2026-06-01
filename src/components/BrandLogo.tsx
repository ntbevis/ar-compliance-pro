import Image from 'next/image';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/legal';

const ICON_SIZES = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
} as const;

type BrandLogoProps = {
  size?: keyof typeof ICON_SIZES;
  showWordmark?: boolean;
  showTagline?: boolean;
  /** `split` stacks "Compliance Guard" / "Pro" for narrow sidebars */
  wordmarkLayout?: 'inline' | 'split';
  tagline?: string;
  className?: string;
  wordmarkClassName?: string;
};

export default function BrandLogo({
  size = 'md',
  showWordmark = false,
  showTagline = false,
  wordmarkLayout = 'inline',
  tagline = PRODUCT_TAGLINE,
  className = '',
  wordmarkClassName = '',
}: BrandLogoProps) {
  const px = ICON_SIZES[size];
  const guardName = PRODUCT_NAME.replace(/\sPro$/, '');
  const wordmarkClasses = wordmarkClassName || 'text-white text-sm sm:text-base';
  const wordmarkSizeClasses = wordmarkClasses.replace(/\btext-white\b/g, '').trim();

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <Image
        src="/logo-shield-square.png"
        alt={showWordmark ? '' : PRODUCT_NAME}
        width={px}
        height={px}
        className="shrink-0 rounded-lg"
        priority={size === 'lg' || size === 'xl'}
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          {wordmarkLayout === 'split' ? (
            <>
              <p className={`font-bold ${wordmarkClasses}`}>{guardName}</p>
              <p className={`font-bold text-emerald-400 ${wordmarkSizeClasses || 'text-sm'}`}>Pro</p>
            </>
          ) : (
            <p className={`font-bold leading-tight break-words ${wordmarkClasses}`}>
              {guardName}{' '}
              <span className="text-emerald-400">Pro</span>
            </p>
          )}
          {showTagline && (
            <p className="hidden sm:block text-blue-300 text-xs leading-snug break-words mt-0.5">
              {tagline}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
