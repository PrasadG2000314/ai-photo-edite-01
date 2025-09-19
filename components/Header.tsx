
import React from 'react';

interface HeaderProps {
  onReset: () => void;
  showReset: boolean;
}

const Header: React.FC<HeaderProps> = ({ onReset, showReset }) => {
  return (
    <header className="bg-gray-900/80 backdrop-blur-sm shadow-lg w-full sticky top-0 z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.414 7.586L16.586 4.757M12.5 11.5l-2 2" />
            </svg>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">AI Photo Lab</h1>
            <span className="text-xs sm:text-sm bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full">Nano Banana</span>
          </div>
          {showReset && (
             <button
                onClick={onReset}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 transition-colors duration-200"
              >
                Start Over
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
