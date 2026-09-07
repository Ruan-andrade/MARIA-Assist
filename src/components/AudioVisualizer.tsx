import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface Props {
  isActive: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  className?: string;
}

export function AudioVisualizer({ isActive, isListening, isSpeaking, className }: Props) {
  const activeColor = "rgba(0, 212, 255, 0.8)";
  const speakingColor = "rgba(0, 255, 200, 0.9)";
  
  return (
    <div className={cn("relative flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1),transparent_60%)] w-full h-full", className)}>
      <motion.div 
        className='absolute w-[350px] h-[350px] border-[0.5px] border-cyan-500/20 rounded-full flex items-center justify-center'
        animate={{ rotate: isActive ? 360 : 0 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      >
        <div className='absolute top-0 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(34,211,238,1)]'></div>
      </motion.div>
      <motion.div 
        className='absolute w-80 h-80 border-[0.5px] border-cyan-500/40 rounded-full flex items-center justify-center'
        animate={{ rotate: isActive ? -360 : 0 }}
        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
      >
        <div className='absolute right-0 w-1 h-1 bg-cyan-400 rounded-full'></div>
      </motion.div>
      <motion.div 
        className='w-64 h-64 border-2 border-cyan-500/30 rounded-full flex items-center justify-center relative bg-black/40'
        animate={{
          scale: isSpeaking ? [1, 1.05, 1] : (isListening ? [1, 1.02, 1] : 1),
          boxShadow: isSpeaking ? `0 0 40px ${speakingColor}` : (isActive ? `0 0 20px ${activeColor}` : 'none')
        }}
        transition={{ duration: isSpeaking ? 0.3 : 1, repeat: Infinity }}
      >
        <div className='w-56 h-56 border border-cyan-500/10 rounded-full flex flex-col items-center justify-center text-center bg-cyan-950/20 backdrop-blur-sm'>
          <div className='text-4xl font-light text-cyan-400 tracking-tighter mb-1'>
            {isSpeaking ? 'SPEAKING' : (isListening ? 'LISTENING' : 'STANDBY')}
          </div>
          <div className='text-[10px] tracking-[0.2em] uppercase opacity-40'>
            {isSpeaking ? 'Audio Output Active' : (isListening ? 'Voice Pattern Recognized' : (isActive ? 'Awaiting Wake Word' : 'Offline'))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
