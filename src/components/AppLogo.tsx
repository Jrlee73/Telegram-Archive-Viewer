import React, { useState } from 'react';
import { FolderUp } from 'lucide-react';

interface AppLogoProps {
  className?: string;
}

/**
 * Single permanent asset location for the custom logo:
 * Project source file location: /public/logo.png
 * Web and packaged Electron relative path: ./logo.png
 */
const LOGO_PATH = './logo.png';

export const AppLogo: React.FC<AppLogoProps> = ({ className = '' }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  return (
    <div className={`flex items-center justify-center mb-5 ${className}`}>
      {!loadFailed && (
        <img
          src={LOGO_PATH}
          alt="App Logo"
          onLoad={() => setImageLoaded(true)}
          onError={() => setLoadFailed(true)}
          className={`max-h-14 max-w-[180px] w-auto h-auto object-contain rounded-2xl shadow-xs transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0 absolute'
          }`}
        />
      )}

      {(!imageLoaded || loadFailed) && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shadow-md shadow-blue-500/10 border border-[var(--border-subtle)]">
          <FolderUp className="w-8 h-8" />
        </div>
      )}
    </div>
  );
};

export default AppLogo;
