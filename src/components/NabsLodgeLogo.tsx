import React, { useState } from 'react';
import { Building2 } from 'lucide-react';

interface NabsLodgeLogoProps {
  className?: string;
  imgClassName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  alt?: string;
}

export const NabsLodgeLogo: React.FC<NabsLodgeLogoProps> = ({ 
  className = '', 
  size = 'md',
  alt = 'Nabslodge Logo'
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  const sizeMap = {
    xs: 'h-8 w-8',
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
    xl: 'h-20 w-20',
  };

  const containerSize = sizeMap[size] || sizeMap.md;

  if (imageFailed) {
    return (
      <div style={{ maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }} className={`${containerSize} bg-emerald-700 text-white flex items-center justify-center rounded-lg shadow-sm shrink-0 font-bold border-2 border-emerald-800 ${className}`}>
        <div className="p-1 border-2 border-emerald-950 rounded-md flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>
      </div>
    );
  }

  return (
    <img 
      src="/logo.png" 
      alt={alt} 
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
      style={{ maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }} className={`${containerSize} object-contain shrink-0 border-2 border-zinc-300 rounded-lg ${className}`} 
    />
  );
};





