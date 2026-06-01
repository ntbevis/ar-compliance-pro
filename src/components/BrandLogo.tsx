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
  tagline?: string;
  className?: string;
  wordmarkClassName?: string;
};

export default function BrandLogo({
  size = 'md',
  showWordmark = false,
  showTagline = false,
  tagline = PRODUCT_TAGLINE,
  className = '',
  wordmarkClassName = '',
}: BrandLogoProps) {
  const px = ICON_SIZES[size];
  const guardName = PRODUCT_NAME.replace(/\sPro$/, '');

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <Image
        src="/logo-shield-square.png"
        alt={PRODUCT_NAME}
        width={px}
        height={px}
        className="shrink-0 rounded-lg"
        priority={size === 'lg' || size === 'xl'}
      />
      {showWordmark && (
        <div className="min-w-0">
          <p
            className={`font-bold leading-tight truncate ${wordmarkClassName || 'text-white text-sm sm:text-base'}`}
          >
            {guardName}{' '}
            <span className="text-emerald-400">Pro</span>
          </p>
          {showTagline && (
            <p className="hidden sm:block text-blue-300 text-xs truncate">{tagline}</p>
          )}
        </div>
      )}
    </div>
  );
}
