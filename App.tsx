import React, { useState } from 'react';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import ImageEditor from './components/ImageEditor';
import Footer from './components/Footer';

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<File | null>(null);

  const handleImageUpload = (file: File) => {
    setOriginalImage(file);
  };
  
  const handleReset = () => {
    setOriginalImage(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      <Header onReset={handleReset} showReset={!!originalImage} />
      <main className="flex-grow flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-7xl mx-auto">
          {!originalImage ? (
            <ImageUploader onImageUpload={handleImageUpload} />
          ) : (
            <ImageEditor 
              imageFile={originalImage} 
              onSetNewOriginal={handleImageUpload}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default App;