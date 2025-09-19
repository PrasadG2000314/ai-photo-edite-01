import React, { useState, useEffect, useMemo, useRef } from 'react';
import { editImageWithGemini } from '../services/geminiService';
import Spinner from './Spinner';
import Alert from './Alert';
import type { EditedImage } from '../types';

interface ImageEditorProps {
  imageFile: File;
  onSetNewOriginal: (file: File) => void;
}

type CropInteraction = {
  type: 'move' | 'resize-tl' | 'resize-t' | 'resize-tr' | 'resize-r' | 'resize-br' | 'resize-b' | 'resize-bl' | 'resize-l';
  startX: number;
  startY: number;
  startCrop: { x: number; y: number; width: number; height: number };
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageFile, onSetNewOriginal }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<EditedImage | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('None');
  const [rotation, setRotation] = useState<number>(0);
  const [rotatedImageUrl, setRotatedImageUrl] = useState<string>('');
  const [blur, setBlur] = useState<number>(0);
  const [sharpen, setSharpen] = useState<number>(0);
  
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Cropping state
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }); // Relative to image dimensions
  const [cropInteraction, setCropInteraction] = useState<CropInteraction | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>('Free');

  const filters = [
    { name: 'None', style: 'none' },
    { name: 'Grayscale', style: 'grayscale(100%)' },
    { name: 'Sepia', style: 'sepia(100%)' },
    { name: 'Vintage', style: 'sepia(60%) contrast(75%) brightness(120%) saturate(120%)' },
    { name: 'Invert', style: 'invert(100%)' },
  ];
  
  const aspectRatios = ['Free', '1:1', '16:9', '4:3'];

  const combinedFilterStyle = useMemo(() => {
    const selected = filters.find(f => f.name === selectedFilter)?.style || 'none';
    const blurFilter = blur > 0 ? `blur(${blur}px)` : '';
    const sharpenFilter = sharpen > 0 ? `contrast(${100 + sharpen}%)` : '';
    
    return [selected, blurFilter, sharpenFilter].filter(f => f && f !== 'none').join(' ') || 'none';
  }, [selectedFilter, blur, sharpen]);


  useEffect(() => {
    // Reset state when imageFile prop changes
    setEditedImage(null);
    setPrompt('');
    setError(null);
    setSelectedFilter('None');
    setRotation(0);
    setBlur(0);
    setSharpen(0);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsCropping(false);
    setCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });

  }, [imageFile]);

  useEffect(() => {
    if (!imageFile || isCropping) return;

    let isCancelled = false;
    const objectUrl = URL.createObjectURL(imageFile);
    const image = new Image();

    image.onload = () => {
      if (isCancelled) { URL.revokeObjectURL(objectUrl); return; }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(objectUrl); return; }
      
      const radians = rotation * Math.PI / 180;
      const isSideways = rotation === 90 || rotation === 270;
      
      canvas.width = isSideways ? image.height : image.width;
      canvas.height = isSideways ? image.width : image.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(radians);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      
      setRotatedImageUrl(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
    return () => { isCancelled = true; URL.revokeObjectURL(objectUrl); };
  }, [imageFile, rotation, isCropping]);


  const applyTransformationsAndGetFile = (file: File, filterStyle: string, rotationAngle: number, blurValue: number, sharpenValue: number): Promise<File> => {
      return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(imageUrl); return reject(new Error('Could not get canvas context')); }
          
          const radians = rotationAngle * Math.PI / 180;
          const isSideways = rotationAngle === 90 || rotationAngle === 270;
          
          canvas.width = isSideways ? image.height : image.width;
          canvas.height = isSideways ? image.width : image.height;

          const blurFilter = blurValue > 0 ? `blur(${blurValue}px)` : '';
          const sharpenFilter = sharpenValue > 0 ? `contrast(${100 + sharpenValue}%)` : '';
          const fullFilter = [filterStyle, blurFilter, sharpenFilter].filter(f => f && f !== 'none').join(' ');

          ctx.filter = fullFilter;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(radians);
          ctx.drawImage(image, -image.width / 2, -image.height / 2);
          
          canvas.toBlob((blob) => {
            if (!blob) { URL.revokeObjectURL(imageUrl); return reject(new Error('Canvas to Blob conversion failed')); }
            const newFile = new File([blob], `transformed-${file.name}`, { type: 'image/png' });
            URL.revokeObjectURL(imageUrl);
            resolve(newFile);
          }, 'image/png');
        };
        image.src = imageUrl;
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setEditedImage(null);

    try {
      let imageToSend = imageFile;
      const activeFilter = filters.find(f => f.name === selectedFilter);
      const filterStyle = activeFilter ? activeFilter.style : 'none';
      
      if (filterStyle !== 'none' || rotation !== 0 || blur > 0 || sharpen > 0) {
        imageToSend = await applyTransformationsAndGetFile(imageFile, filterStyle, rotation, blur, sharpen);
      }
      
      const result = await editImageWithGemini(imageToSend, prompt);
      setEditedImage(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'An unexpected error occurred.'); } 
    finally { setIsLoading(false); }
  };

  const handleDownload = () => {
    if (!editedImage) return;
    const link = document.createElement('a');
    link.href = editedImage.imageUrl;
    link.download = `edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUseAsOriginal = async () => {
    if (!editedImage?.imageUrl) return;
    try {
      const response = await fetch(editedImage.imageUrl);
      const blob = await response.blob();
      const newFileName = `edited-${Date.now()}.png`;
      const newFile = new File([blob], newFileName, { type: blob.type });
      onSetNewOriginal(newFile);
    } catch (err) { setError(err instanceof Error ? `Error setting new image: ${err.message}` : 'Could not use this image for further editing.'); }
  };
  
  const handleRotate = (degrees: number) => { setRotation(prev => (prev + degrees + 360) % 360); };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const newScale = e.deltaY < 0 ? scale * 1.1 : scale / 1.1;
    const clampedScale = Math.min(Math.max(0.5, newScale), 5);
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newX = mouseX - (mouseX - position.x) * (clampedScale / scale);
    const newY = mouseY - (mouseY - position.y) * (clampedScale / scale);
    setScale(clampedScale);
    setPosition({ x: newX, y: newY });
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCropping || e.button !== 0) return;
    e.preventDefault();
    setIsPanning(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPosition({ x: position.x + e.movementX, y: position.y + e.movementY });
  };
  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => setIsPanning(false);
  const handleZoomAction = (direction: 'in' | 'out') => { setScale(s => Math.min(Math.max(0.5, direction === 'in' ? s * 1.2 : s / 1.2), 5)); };
  const handleResetView = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  const examplePrompts = [ "Add a cute party hat", "Change background to a cityscape", "Make it a vintage photograph", "Turn sky into a sunset", "Add a small, friendly robot", ];
  const handleExamplePrompt = (example: string) => { setPrompt(example); };
  
  // Cropping handlers
  const handleCropMouseDown = (e: React.MouseEvent, type: CropInteraction['type']) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const imageRect = imageRef.current?.getBoundingClientRect();
    const containerRect = imageContainerRef.current?.getBoundingClientRect();
    if (!imageRect || !containerRect) return;

    const mouseX = (e.clientX - imageRect.left) / imageRect.width;
    const mouseY = (e.clientY - imageRect.top) / imageRect.height;

    setCropInteraction({ type, startX: mouseX, startY: mouseY, startCrop: { ...crop } });
  };

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!cropInteraction) return;
    const imageRect = imageRef.current?.getBoundingClientRect();
    if (!imageRect) return;

    const dx = ((e.clientX - imageRect.left) / imageRect.width) - cropInteraction.startX;
    const dy = ((e.clientY - imageRect.top) / imageRect.height) - cropInteraction.startY;

    let newCrop = { ...cropInteraction.startCrop };
    
    // Resize logic
    if (cropInteraction.type.startsWith('resize-')) {
        const { type, startCrop } = cropInteraction;
        let { x, y, width, height } = startCrop;

        if (type.includes('l')) { width -= dx; x += dx; }
        if (type.includes('r')) { width += dx; }
        if (type.includes('t')) { height -= dy; y += dy; }
        if (type.includes('b')) { height += dy; }
        
        // Prevent inversion
        if (width < 0.05) { width = 0.05; x = type.includes('l') ? startCrop.x + startCrop.width - 0.05 : startCrop.x; }
        if (height < 0.05) { height = 0.05; y = type.includes('t') ? startCrop.y + startCrop.height - 0.05 : startCrop.y; }

        newCrop = { x, y, width, height };
        
        // Enforce aspect ratio
        if (aspectRatio !== 'Free') {
          // FIX: Correctly parse aspect ratio. The previous use of `reduce` was incorrect for a string array and caused type errors.
          const ratioParts = aspectRatio.split(':');
          const ratio = Number(ratioParts[0]) / Number(ratioParts[1]);
          if (type.includes('l') || type.includes('r')) {
            newCrop.height = newCrop.width / ratio;
          } else {
            newCrop.width = newCrop.height * ratio;
          }
          // Adjust position for top/left resizes to keep opposite corner anchored
           if (type.includes('t')) newCrop.y = startCrop.y + startCrop.height - newCrop.height;
           if (type.includes('l')) newCrop.x = startCrop.x + startCrop.width - newCrop.width;
        }

    } else if (cropInteraction.type === 'move') { // Move logic
        newCrop.x = cropInteraction.startCrop.x + dx;
        newCrop.y = cropInteraction.startCrop.y + dy;
    }

    // Boundary checks
    newCrop.x = Math.max(0, Math.min(newCrop.x, 1 - newCrop.width));
    newCrop.y = Math.max(0, Math.min(newCrop.y, 1 - newCrop.height));
    newCrop.width = Math.min(newCrop.width, 1 - newCrop.x);
    newCrop.height = Math.min(newCrop.height, 1 - newCrop.y);

    setCrop(newCrop);
  };
  
  const handleCropMouseUp = () => { setCropInteraction(null); };

  const handleApplyCrop = () => {
    const imageUrl = URL.createObjectURL(imageFile);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const cropX = crop.x * image.width;
      const cropY = crop.y * image.height;
      const cropWidth = crop.width * image.width;
      const cropHeight = crop.height * image.height;

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      
      canvas.toBlob(blob => {
        if (!blob) return;
        const newFile = new File([blob], `cropped-${imageFile.name}`, { type: 'image/png' });
        onSetNewOriginal(newFile);
        setIsCropping(false);
      }, 'image/png');
      URL.revokeObjectURL(imageUrl);
    };
    image.src = imageUrl;
  };

  const handleCancelCrop = () => {
    setIsCropping(false);
    setCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }); // Reset crop
  };

  const originalImageUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : '', [imageFile]);

  useEffect(() => {
    return () => {
      if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    }
  }, [originalImageUrl]);

  const imageUrlToShow = isCropping ? originalImageUrl : rotatedImageUrl;
  
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold text-gray-300 mb-3">Original</h2>
          <div 
            ref={imageContainerRef}
            className={`relative w-full aspect-square bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700 shadow-lg flex items-center justify-center ${!isCropping && (isPanning ? 'cursor-grabbing' : 'cursor-grab')}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown} onMouseMove={isCropping ? handleCropMouseMove : handleMouseMove} onMouseUp={isCropping ? handleCropMouseUp : handleMouseUp} onMouseLeave={isCropping ? handleCropMouseUp : handleMouseLeave}
          >
            {imageUrlToShow && (
                <div 
                    className="relative"
                    style={{ 
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                        willChange: 'transform',
                    }}
                >
                    <img 
                        ref={imageRef}
                        src={imageUrlToShow} 
                        alt="Original" 
                        className="max-w-none max-h-none"
                        style={{ 
                          filter: !isCropping ? combinedFilterStyle : 'none',
                        }}
                        draggable="false"
                    />
                    {isCropping && imageRef.current && (
                        <>
                         <div className="absolute inset-0 bg-black/60 pointer-events-none" style={{
                            clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${crop.x * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${(crop.y + crop.height) * 100}%, ${(crop.x + crop.width) * 100}% ${(crop.y + crop.height) * 100}%, ${(crop.x + crop.width) * 100}% ${crop.y * 100}%, ${crop.x * 100}% ${crop.y * 100}%)`
                         }}/>
                         <div className="absolute border-2 border-purple-400 cursor-move" onMouseDown={e => handleCropMouseDown(e, 'move')} style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
                             {['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'].map(handle => (
                               <div key={handle} onMouseDown={e => handleCropMouseDown(e, `resize-${handle}` as CropInteraction['type'])} className={`absolute w-3 h-3 bg-purple-400 rounded-full -translate-x-1/2 -translate-y-1/2 
                                 ${handle.includes('t') ? 'top-0' : handle.includes('b') ? 'bottom-0' : 'top-1/2'} 
                                 ${handle.includes('l') ? 'left-0' : handle.includes('r') ? 'right-0' : 'left-1/2'}
                                 ${(handle === 't' || handle === 'b') ? 'cursor-ns-resize' : (handle === 'l' || handle === 'r') ? 'cursor-ew-resize' : (handle === 'tl' || handle === 'br') ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}
                               `}/>
                             ))}
                         </div>
                        </>
                    )}
                </div>
            )}
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-gray-900/60 backdrop-blur-sm p-1 rounded-lg">
                <button onClick={() => handleZoomAction('out')} title="Zoom Out" className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg></button>
                <button onClick={handleResetView} title="Reset View" className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" /></svg></button>
                <button onClick={() => handleZoomAction('in')} title="Zoom In" className="p-1.5 rounded-md hover:bg-gray-700 text-gray-300 transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg></button>
            </div>
          </div>
           <div className="w-full mt-4">
             {isCropping ? (
                <div className="w-full p-2 space-y-3 bg-gray-800/30 rounded-lg border border-gray-700/50">
                    <div>
                        <p className="text-sm text-center text-gray-400 mb-2">Aspect Ratio</p>
                        <div className="flex justify-center gap-2">
                           {aspectRatios.map(ar => (
                             <button key={ar} onClick={() => setAspectRatio(ar)} className={`px-3 py-1 text-sm rounded-md transition-colors ${aspectRatio === ar ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{ar}</button>
                           ))}
                        </div>
                    </div>
                    <div className="flex justify-center gap-4 pt-2 border-t border-gray-700">
                        <button onClick={handleCancelCrop} className="px-6 py-2 text-sm font-semibold text-white bg-gray-600 rounded-lg hover:bg-gray-500 transition-colors">Cancel</button>
                        <button onClick={handleApplyCrop} className="px-6 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors">Apply Crop</button>
                    </div>
                </div>
             ) : (
                <>
                <div className="flex justify-center items-center gap-3 mb-2">
                    <p className="text-sm text-gray-400">Adjust:</p>
                    <button onClick={() => setIsCropping(true)} title="Crop Image" className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19M4.879 4.879L9.75 9.75m1.379-1.379L19 19M15 4.879L9.75 9.75M4.879 15L9.75 9.75" /></svg></button>
                    <button onClick={() => handleRotate(-90)} title="Rotate Left" className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-6 6m0 0l-6-6m6 6V9a6 6 0 0112 0v3" /></svg></button>
                    <button onClick={() => handleRotate(90)} title="Rotate Right" className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15l6 6m0 0l6-6m-6 6V9a6 6 0 00-12 0v3" /></svg></button>
                </div>
                <div className="w-full p-4 space-y-4 bg-gray-800/30 rounded-lg mt-4 border border-gray-700/50">
                    <div><label htmlFor="blur" className="flex justify-between text-sm font-medium text-gray-400 mb-1"><span>Blur</span><span>{blur}px</span></label><input id="blur" type="range" min="0" max="10" step="1" value={blur} onChange={e => setBlur(Number(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500" /></div>
                    <div><label htmlFor="sharpen" className="flex justify-between text-sm font-medium text-gray-400 mb-1"><span>Sharpen</span><span>{sharpen}%</span></label><input id="sharpen" type="range" min="0" max="100" step="1" value={sharpen} onChange={e => setSharpen(Number(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500" /></div>
                </div>
                <p className="text-sm text-center text-gray-400 mb-3 pt-4 mt-4 border-t border-gray-700">Apply a Filter</p>
                <div className="flex justify-center gap-3 p-2 overflow-x-auto">
                {filters.map((filter) => (<button key={filter.name} onClick={() => setSelectedFilter(filter.name)} className={`flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer p-1.5 rounded-lg transition-all duration-200 focus:outline-none ${ selectedFilter === filter.name ? 'bg-purple-500/30 ring-2 ring-purple-500' : 'hover:bg-gray-700/50' }`} aria-pressed={selectedFilter === filter.name}>
                    <div className="w-16 h-16 bg-gray-800 rounded-md overflow-hidden border-2 border-gray-600">{rotatedImageUrl && ( <img src={rotatedImageUrl} alt={`${filter.name} filter preview`} className="w-full h-full object-cover" style={{ filter: filter.style }} />)}</div>
                    <span className={`text-xs font-medium ${selectedFilter === filter.name ? 'text-purple-300' : 'text-gray-400'}`}>{filter.name}</span>
                </button>))}
                </div>
                </>
             )}
          </div>
        </div>
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-semibold text-gray-300 mb-3">Edited</h2>
          <div className="relative w-full aspect-square bg-gray-800/50 rounded-lg flex items-center justify-center border border-gray-700 shadow-lg overflow-hidden">
            {isLoading ? ( <div className="flex flex-col items-center"><Spinner /><p className="mt-4 text-gray-400">AI is thinking...</p></div>
            ) : editedImage ? (
              <>
                <img src={editedImage.imageUrl} alt="Edited" className="w-full h-full object-contain" />
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <button onClick={handleUseAsOriginal} className="p-2 rounded-full bg-gray-900/60 backdrop-blur-sm hover:bg-gray-800 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500" title="Continue editing this image" aria-label="Continue editing this image"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg></button>
                  <button onClick={handleDownload} className="p-2 rounded-full bg-gray-900/60 backdrop-blur-sm hover:bg-gray-800 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500" title="Download Image" aria-label="Download Image"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                </div>
              </>
            ) : ( <div className="text-center text-gray-500 p-4"><svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><p>Your edited image will appear here.</p></div> )}
          </div>
        </div>
      </div>
      {editedImage && !isLoading && ( <div className="mb-6 p-4 bg-gray-800/60 border border-gray-700 rounded-lg text-center"><p className="text-gray-300 italic">✨ {editedImage.text}</p></div> )}
      {error && <Alert message={error} onClose={() => setError(null)} />}
      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto mt-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-800/50 p-2 rounded-lg border border-gray-700 shadow-md">
          <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., Add a wizard hat" className="w-full px-4 py-3 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 transition-shadow duration-200" disabled={isLoading} aria-label="Image editing prompt"/>
          <button type="submit" disabled={isLoading || !prompt.trim()} className="w-full sm:w-auto flex items-center justify-center px-6 py-3 font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200">
            {isLoading ? ( <> <Spinner small /> <span className="ml-2">Generating...</span> </> ) : ( 'Generate' )}
          </button>
        </div>
      </form>
      <div className="text-center mt-6">
        <p className="text-sm text-gray-400 mb-3">Or try an example:</p>
        <div className="flex flex-wrap justify-center gap-2">
            {examplePrompts.map((p, index) => ( <button key={index} type="button" onClick={() => handleExamplePrompt(p)} disabled={isLoading} className="px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-500/20 rounded-full hover:bg-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{p}</button>))}
        </div>
      </div>
    </div>
  );
};
export default ImageEditor;