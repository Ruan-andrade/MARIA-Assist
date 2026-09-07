import React, { useState, useEffect, useRef } from 'react';
import { pcmToBase64, AudioStreamPlayer } from '../lib/audio';
import { AudioVisualizer } from './AudioVisualizer';
import { User } from 'firebase/auth';
import { googleSignIn, initAuth, getAccessToken, logout } from '../lib/firebase';
import { Memory, getMemories, saveMemory } from '../lib/memory';
import { 
  Shield, 
  Mic, 
  MicOff, 
  Volume2, 
  BrainCircuit, 
  Send, 
  Power, 
  LogIn, 
  LogOut, 
  Terminal as TerminalIcon, 
  Calendar, 
  Plus, 
  Radio,
  Laptop,
  Globe,
  FolderPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { desktopBridge, DesktopMode } from '../lib/desktopBridge';
import { DesktopBridgeModal } from './DesktopBridgeModal';
import { SystemStats } from '../types';

export default function MariaHUD() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    'Sistema MARIA pronto para inicialização.',
    'Clique em "ESTABELECER CONEXÃO" ou diga "Maria" para ativar.'
  ]);
  const [user, setUser] = useState<User | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ id: string, action: string, args: any } | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [inputCommand, setInputCommand] = useState('');
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [showAddMemory, setShowAddMemory] = useState(false);
  
  // Desktop System & Automation State
  const [desktopMode, setDesktopMode] = useState<DesktopMode>(desktopBridge.getMode());
  const [desktopStats, setDesktopStats] = useState<SystemStats | null>(desktopBridge.stats);
  const [isDesktopModalOpen, setIsDesktopModalOpen] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioStreamPlayer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-6), `> ${msg}`]);
  };

  useEffect(() => {
    initAuth(
      async (u) => {
        setUser(u);
        addLog(`Identidade confirmada: ${u.email}`);
        loadMemoriesList();
      },
      () => {
        setUser(null);
        loadMemoriesList();
      }
    );

    startWakeWordDetection();

    const unsubBridge = desktopBridge.subscribe((status) => {
      setDesktopMode(status.mode);
      setDesktopStats(status.stats);
      if (status.mode === 'electron') {
        addLog('Modo Nativo Desktop (Electron) ativo com acesso total ao sistema.');
      } else if (status.mode === 'daemon') {
        addLog(`Daemon Local conectado ao host: ${status.stats?.hostname || 'PC'} (${status.stats?.platform || 'Nativo'}).`);
      }
    });

    return () => {
      cleanupAudio();
      unsubBridge();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
    };
  }, []);

  const loadMemoriesList = async () => {
    try {
      const mems = await getMemories();
      setMemories(mems);
      if (mems.length > 0) {
        addLog(`${mems.length} memórias carregadas do núcleo.`);
      }
    } catch (e) {
      console.error('Failed to load memories:', e);
    }
  };

  const handleLogin = async () => {
    try {
      addLog('Iniciando autenticação biométrica Google...');
      const res = await googleSignIn();
      if (res?.user) {
        setUser(res.user);
        addLog(`Autenticado com sucesso: ${res.user.email}`);
        await loadMemoriesList();
      }
    } catch (err: any) {
      addLog(`Falha na autorização: ${err.message || 'Cancelado'}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    addLog('Sessão Google encerrada.');
  };

  const startWakeWordDetection = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
          
        if (transcript.toLowerCase().includes('Maria') && !isConnected && !isConnecting) {
          addLog('Palavra de ativação "Maria" detectada.');
          connectToLiveAPI();
          try { recognition.stop(); } catch(e) {}
        }
      };
      
      recognition.onend = () => {
        if (!wsRef.current) {
          try { recognition.start(); } catch(e) {}
        }
      };
      
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Wake word listener not available:", e);
    }
  };

  const connectToLiveAPI = async () => {
    if (wsRef.current || isConnecting) return;
    
    setIsConnecting(true);
    addLog('Estabelecendo uplink neural com o servidor MARIA...');

    try {
      playerRef.current = new AudioStreamPlayer(24000);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const backendHost = import.meta.env.VITE_BACKEND_URL || window.location.host;
      const ws = new WebSocket(`${backendHost.startsWith('ws') ? '' : protocol + '//'}${backendHost}/live`);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        setIsConnecting(false);
        addLog('Uplink conectado. Transmissão de voz inicializada.');
        
        // Send init payload with token and core memories
        const token = await getAccessToken();
        const currentMems = await getMemories();
        ws.send(JSON.stringify({ 
          type: "init", 
          token: token || null, 
          memories: currentMems 
        }));
        
        // Initialize microphone capture
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          
          const audioCtx = new AudioContext({ sampleRate: 16000 });
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }
          audioContextRef.current = audioCtx;
          
          const source = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          
          // Mute feedback to prevent user mic echoing through computer speakers
          const muteGain = audioCtx.createGain();
          muteGain.gain.value = 0;
          source.connect(processor);
          processor.connect(muteGain);
          muteGain.connect(audioCtx.destination);
          
          setIsListening(true);
          
          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN && !isMicMuted) {
              const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
              ws.send(JSON.stringify({ audio: base64 }));
            }
          };
          addLog('Microfone ativo. Maria está ouvindo.');
        } catch (micErr: any) {
          console.warn('Microphone permission issue:', micErr);
          addLog('Aviso: Microfone não disponível. Modo texto ativo.');
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "confirm_request") {
            setConfirmDialog({ id: msg.id, action: msg.action, args: msg.args });
            addLog(`Autorização necessária para ação: ${msg.action}`);
            return;
          }

          if (msg.type === "execute_local_action") {
            addLog(`[PC Local]: Executando "${msg.name}"...`);
            try {
              const execRes = await desktopBridge.executeAction(msg.name, msg.args);
              if (execRes.success) {
                const displayResult = typeof execRes.result === 'object' ? JSON.stringify(execRes.result) : execRes.result;
                addLog(`[PC Sucesso]: ${displayResult}`);
                ws.send(JSON.stringify({
                  type: "local_action_response",
                  id: msg.id,
                  success: true,
                  result: execRes.result
                }));
              } else {
                addLog(`[PC Falha]: ${execRes.error}`);
                ws.send(JSON.stringify({
                  type: "local_action_response",
                  id: msg.id,
                  success: false,
                  error: execRes.error
                }));
              }
            } catch (err: any) {
              addLog(`[PC Exceção]: ${err.message}`);
              ws.send(JSON.stringify({
                type: "local_action_response",
                id: msg.id,
                success: false,
                error: err.message
              }));
            }
            return;
          }
          
          if (msg.type === "save_memory") {
            addLog(`Armazenando memória: "${msg.args.content}"`);
            try {
              await saveMemory(msg.args.content, msg.args.category || 'preference');
              ws.send(JSON.stringify({ type: "save_memory_response", id: msg.id, success: true }));
              const updatedMems = await getMemories();
              setMemories(updatedMems);
              addLog("Memória integrada com sucesso.");
            } catch (e: any) {
              ws.send(JSON.stringify({ type: "save_memory_response", id: msg.id, success: false, error: e.message }));
              addLog("Falha ao salvar memória.");
            }
            return;
          }
          
          if (msg.text) {
            addLog(`Maria: ${msg.text}`);
          }

          if (msg.error) {
            addLog(`[Erro]: ${msg.error}`);
          }
          
          if (msg.audio) {
            setIsSpeaking(true);
            playerRef.current?.playChunk(msg.audio);
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), 800);
          }

          if (msg.interrupted) {
            playerRef.current?.stop();
            playerRef.current = new AudioStreamPlayer(24000);
            setIsSpeaking(false);
            addLog('Resposta de áudio interrompida.');
          }
        } catch (parseErr) {
          console.error("Failed to parse WebSocket message", parseErr);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        addLog('Erro de transmissão no canal WebSocket.');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        setIsListening(false);
        setIsSpeaking(false);
        addLog('Uplink desconectado.');
        cleanupAudio();
        startWakeWordDetection();
      };
    } catch (err: any) {
      console.error("Failed to connect:", err);
      addLog(`Falha ao conectar: ${err.message || 'Erro de rede'}`);
      setIsConnecting(false);
      cleanupAudio();
    }
  };

  const cleanupAudio = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    wsRef.current = null;
  };

  const handleDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    cleanupAudio();
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
  };

  const handleConfirm = (confirmed: boolean) => {
    if (confirmDialog && wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "confirm_response", id: confirmDialog.id, confirmed }));
      addLog(`Ação ${confirmed ? 'autorizada' : 'recusada'} pelo operador.`);
      setConfirmDialog(null);
    }
  };

  const handleSendCommand = (textToSend?: string) => {
    const cmd = textToSend || inputCommand;
    if (!cmd.trim()) return;

    addLog(`Comando: "${cmd}"`);

    if (isConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: cmd }));
    } else {
      // Auto-connect and then send
      connectToLiveAPI().then(() => {
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ text: cmd }));
          }
        }, 800);
      });
    }

    if (!textToSend) setInputCommand('');
  };

  const handleManualAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryInput.trim()) return;
    try {
      await saveMemory(newMemoryInput.trim(), 'preference');
      setNewMemoryInput('');
      setShowAddMemory(false);
      await loadMemoriesList();
      addLog('Nova preferência gravada na memória.');
    } catch (err: any) {
      addLog(`Erro ao salvar memória: ${err.message}`);
    }
  };

  const toggleMic = () => {
    setIsMicMuted(prev => !prev);
    addLog(isMicMuted ? 'Microfone reativado.' : 'Microfone pausado.');
  };

  return (
    <div className="bg-[#03070b] text-cyan-50 font-sans h-full w-full flex flex-col p-2 md:p-6 border-0 md:border-4 border-[#0a1a2f] relative overflow-x-hidden overflow-y-auto md:overflow-hidden selection:bg-cyan-900 select-none">
      {/* HUD Background Grid & Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.06),transparent_75%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#06b6d405_1px,transparent_1px),linear-gradient(to_bottom,#06b6d405_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* TOP HUD HEADER */}
      <header className='flex flex-wrap justify-between items-center gap-4 mb-4 z-10 pb-3 border-b border-cyan-500/20 shrink-0'>
        <div className='flex items-center space-x-4'>
          <div className='w-10 h-10 border border-cyan-400/50 flex items-center justify-center rounded-sm bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'>
            <div className={cn(
              'w-5 h-5 border-2 rounded-full transition-all duration-500',
              isConnected 
                ? 'border-cyan-400 bg-cyan-400/30 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]' 
                : 'border-cyan-800'
            )} />
          </div>
          <div>
            <div className='flex items-center gap-2'>
              <h1 className='text-[10px] font-bold tracking-[0.25em] uppercase text-cyan-400/70'>SISTEMA AUTÔNOMO DE IA</h1>
              <span className='inline-block w-1.5 h-1.5 rounded-full bg-cyan-400'></span>
              <span className='text-[9px] font-mono tracking-widest text-cyan-500/60 uppercase'>MARK VII</span>
            </div>
            <p className='text-xl font-light tracking-tight text-white flex items-center gap-2'>
              MARIA <span className='text-cyan-400 font-mono text-sm px-1.5 py-0.5 border border-cyan-500/30 bg-cyan-950/40'>ONLINE</span>
            </p>
          </div>
        </div>

        <div className='flex items-center gap-6 text-[10px] tracking-widest uppercase font-mono'>
          <div className='flex flex-col items-end border-r border-cyan-500/20 pr-4'>
            <span className='opacity-40'>Google Workspace</span>
            <span className={user ? 'text-cyan-400 flex items-center gap-1 font-semibold' : 'text-orange-400'}>
              {user ? (
                <>
                  <span>{user.email?.split('@')[0]}</span>
                  <button onClick={handleLogout} title="Desconectar" className="hover:text-red-400 ml-1">
                    <LogOut className="w-3 h-3 inline" />
                  </button>
                </>
              ) : (
                'Desconectado'
              )}
            </span>
          </div>

          <div className='flex flex-col items-end border-r border-cyan-500/20 pr-4'>
            <span className='opacity-40'>Canal de Voz</span>
            <span className={isConnected ? 'text-green-400 flex items-center gap-1' : 'text-cyan-700'}>
              <Radio className="w-3 h-3" />
              {isConnected ? 'Ativo (Gemini 3.1 Live)' : 'Standby'}
            </span>
          </div>

          <div className='flex flex-col items-end border-r border-cyan-500/20 pr-4'>
            <span className='opacity-40'>Controle do PC</span>
            <button 
              onClick={() => setIsDesktopModalOpen(true)}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer group"
              title="Configurar integração nativa com PC / Electron"
            >
              <Laptop className="w-3 h-3 text-cyan-400 group-hover:scale-110 transition-transform" />
              <span className={cn(
                'font-semibold',
                desktopMode === 'electron' ? 'text-green-400' : desktopMode === 'daemon' ? 'text-cyan-400 animate-pulse' : 'text-yellow-400'
              )}>
                {desktopMode === 'electron' ? 'NATIVO ELECTRON' : desktopMode === 'daemon' ? 'PC CONECTADO' : 'CONECTAR PC'}
              </span>
            </button>
          </div>

          <div className='flex flex-col items-end'>
            <span className='opacity-40'>Estado do Uplink</span>
            <span className={isConnected ? 'text-cyan-400 font-bold' : isConnecting ? 'text-yellow-400 animate-pulse' : 'text-orange-400'}>
              {isConnected ? '● CONECTADO' : isConnecting ? 'CONECTANDO...' : '○ DESCONECTADO'}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN 3-COLUMN LAYOUT */}
      <main className='flex-1 grid grid-cols-12 gap-4 md:gap-6 z-10 overflow-hidden'>
        
        {/* LEFT COLUMN: Controls & Core Memories */}
        <section className='col-span-12 lg:col-span-3 flex flex-col space-y-4 overflow-hidden'>
          
          {/* Main Action Connection Controls */}
          <div className='bg-cyan-950/20 border border-cyan-500/30 p-4 rounded-sm flex flex-col gap-3 shadow-[0_0_20px_rgba(6,182,212,0.05)]'>
            <div className='flex justify-between items-center'>
              <h2 className='text-[10px] font-bold tracking-widest uppercase text-cyan-400 flex items-center gap-1.5'>
                <Power className="w-3.5 h-3.5" /> Controle de Comunicação
              </h2>
              <span className={cn('text-[9px] font-mono px-1.5 py-0.5 border uppercase', isConnected ? 'border-green-500/40 text-green-400' : 'border-cyan-800 text-cyan-600')}>
                {isConnected ? 'Ao Vivo' : 'Inativo'}
              </span>
            </div>

            {!isConnected ? (
              <button 
                id="connect-Maria-btn"
                onClick={connectToLiveAPI}
                disabled={isConnecting}
                className="w-full relative group overflow-hidden border-2 border-cyan-400 bg-cyan-950/60 hover:bg-cyan-400 hover:text-black transition-all duration-300 px-4 py-3 text-xs uppercase tracking-widest font-bold text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.7)] cursor-pointer flex items-center justify-center gap-2"
              >
                <Radio className="w-4 h-4 animate-pulse text-cyan-400 group-hover:text-black" />
                <span>{isConnecting ? 'CONECTANDO...' : 'CONECTAR Maria'}</span>
              </button>
            ) : (
              <div className="flex gap-2">
                <button 
                  id="mute-mic-btn"
                  onClick={toggleMic}
                  className={cn(
                    "flex-1 border py-2.5 px-3 text-[11px] uppercase tracking-wider font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    isMicMuted 
                      ? "border-yellow-500/60 text-yellow-400 bg-yellow-950/30" 
                      : "border-cyan-500/60 text-cyan-300 bg-cyan-950/40 hover:border-cyan-400"
                  )}
                >
                  {isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  <span>{isMicMuted ? 'Desmutar' : 'Silenciar'}</span>
                </button>

                <button 
                  id="disconnect-Maria-btn"
                  onClick={handleDisconnect}
                  className="flex-1 border border-red-500/60 text-red-400 hover:bg-red-500 hover:text-white transition-all py-2.5 px-3 text-[11px] uppercase tracking-wider font-bold bg-red-950/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            )}

            {!user && (
              <button 
                id="login-google-btn"
                onClick={handleLogin}
                className="w-full border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 hover:bg-cyan-950/40 transition-colors px-3 py-2 text-[10px] uppercase tracking-widest font-mono flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-3 h-3" />
                <span>Vincular Google (Agenda & Drive)</span>
              </button>
            )}
          </div>

          {/* Core Memory Engine */}
          <div className='bg-cyan-950/10 border border-cyan-500/20 p-4 flex-1 flex flex-col overflow-hidden rounded-sm'>
            <div className="flex justify-between items-center mb-3">
              <h2 className='text-[10px] font-bold tracking-widest uppercase text-cyan-400 flex items-center gap-1.5'>
                <BrainCircuit className="w-3.5 h-3.5" /> Memória de Longo Prazo
              </h2>
              <button 
                onClick={() => setShowAddMemory(p => !p)}
                className="text-[9px] uppercase font-mono px-2 py-0.5 border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-2.5 h-2.5" />
                <span>Adicionar</span>
              </button>
            </div>

            {showAddMemory && (
              <form onSubmit={handleManualAddMemory} className="mb-3 p-2 border border-cyan-500/30 bg-black/50 space-y-2">
                <input 
                  type="text"
                  placeholder="Ex: Prefiro reuniões após as 14h"
                  value={newMemoryInput}
                  onChange={(e) => setNewMemoryInput(e.target.value)}
                  className="w-full bg-cyan-950/40 border border-cyan-500/40 px-2 py-1.5 text-xs text-cyan-100 placeholder:text-cyan-700 outline-none focus:border-cyan-300 font-mono"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowAddMemory(false)} className="text-[9px] text-cyan-600 px-2 py-0.5">Cancelar</button>
                  <button type="submit" className="text-[9px] border border-cyan-400 bg-cyan-500/20 text-cyan-300 px-2.5 py-0.5 font-bold">Salvar</button>
                </div>
              </form>
            )}

            <div className='space-y-2 flex-1 overflow-y-auto pr-1'>
              {memories.length === 0 ? (
                <div className='text-[10px] opacity-40 uppercase tracking-widest text-center py-6 font-mono'>
                  Nenhuma memória registrada.<br/>
                  <span className="text-[9px] text-cyan-600">Diga: "Maria, guarde que prefiro café sem açúcar"</span>
                </div>
              ) : (
                memories.map((mem) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={mem.id} 
                    className='border-b border-cyan-500/10 pb-2 bg-cyan-950/10 p-2'
                  >
                    <div className='flex justify-between items-center mb-1 text-[9px]'>
                      <span className='uppercase tracking-widest text-cyan-500 font-mono'>[{mem.category}]</span>
                      <span className='w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]'></span>
                    </div>
                    <span className='text-xs text-cyan-200 block font-light leading-snug'>{mem.content}</span>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* CENTER COLUMN: Arc Visualizer + Neural Terminal + Command Bar */}
        <section className='col-span-12 lg:col-span-6 flex flex-col h-full overflow-hidden justify-between'>
          
          {/* Main Visualizer */}
          <div className="relative flex-1 min-h-[260px] flex items-center justify-center">
            <AudioVisualizer 
              isActive={isConnected} 
              isListening={isListening && !isMicMuted} 
              isSpeaking={isSpeaking} 
            />
          </div>

          {/* Quick Action Chips */}
          <div className="py-2 flex flex-wrap gap-2 justify-center shrink-0">
            {[
              { label: '🌐 Abrir Navegador', cmd: 'Maria, abra o navegador de internet e busque novidades de tecnologia.' },
              { label: '📁 Criar Pasta no PC', cmd: 'Maria, crie uma pasta chamada Maria_Workspace no meu computador.' },
              { label: '🔍 Pesquisa Autônoma', cmd: 'Maria, pesquise na internet sobre os avanços recentes em IA.' },
              { label: '📅 Agenda Hoje', cmd: 'Maria, quais são os meus compromissos de hoje na agenda?' },
              { label: '⚡ Status do Sistema', cmd: 'Maria, forneça um diagnóstico dos sistemas locais e de rede.' },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSendCommand(item.cmd)}
                className="text-[10px] uppercase font-mono px-2.5 py-1 border border-cyan-500/30 hover:border-cyan-400 bg-cyan-950/30 hover:bg-cyan-500/10 text-cyan-300 transition-colors cursor-pointer rounded-sm"
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => setIsDesktopModalOpen(true)}
              className="text-[10px] uppercase font-mono px-2.5 py-1 border border-cyan-400/60 hover:border-cyan-300 bg-cyan-900/40 text-cyan-200 transition-colors cursor-pointer rounded-sm font-bold flex items-center gap-1"
            >
              <Laptop className="w-3 h-3 text-cyan-400" />
              <span>Painel PC Local</span>
            </button>
          </div>

          {/* Neural Sequence Terminal */}
          <div className='w-full shrink-0 mt-2 mb-3'>
            <div className='flex items-center justify-between space-x-2 mb-1.5'>
              <div className="flex items-center space-x-2">
                <div className='w-1.5 h-1.5 bg-cyan-400 animate-pulse'></div>
                <span className='text-[10px] uppercase tracking-widest font-mono text-cyan-400/80 flex items-center gap-1.5'>
                  <TerminalIcon className="w-3 h-3" /> Sequência Neural Ativa (Terminal)
                </span>
              </div>
              <span className="text-[9px] font-mono text-cyan-600">MODO LIVE 16kHz</span>
            </div>
            
            <div className='bg-black/60 border border-cyan-500/30 p-3 h-28 font-mono text-xs text-cyan-300 leading-relaxed overflow-hidden flex flex-col justify-end shadow-inner'>
              {logs.slice(-5).map((log, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  key={i}
                  className="truncate"
                >
                  {log}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Direct Interactive Command Input */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSendCommand(); }}
            className="flex gap-2 shrink-0"
          >
            <div className="relative flex-1">
              <input 
                id="Maria-command-input"
                type="text"
                value={inputCommand}
                onChange={(e) => setInputCommand(e.target.value)}
                placeholder={isConnected ? 'Fale pelo microfone ou digite um comando para Maria...' : 'Clique em CONECTAR Maria ou digite um comando aqui...'}
                className="w-full bg-cyan-950/40 border border-cyan-500/40 focus:border-cyan-300 px-4 py-2.5 text-xs text-cyan-100 placeholder:text-cyan-700 outline-none font-mono transition-colors"
              />
            </div>
            <button
              type="submit"
              className="border border-cyan-400 bg-cyan-950/80 hover:bg-cyan-400 hover:text-black text-cyan-300 px-4 py-2.5 text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>
          </form>
        </section>

        {/* RIGHT COLUMN: Agenda, Sensors & System Telemetry */}
        <section className='col-span-12 lg:col-span-3 flex flex-col space-y-4 overflow-hidden'>
          
          {/* Agenda & Automation Tasks */}
          <div className='bg-cyan-950/10 border border-cyan-500/20 p-4 flex-1 flex flex-col rounded-sm overflow-hidden'>
            <h2 className='text-[10px] font-bold tracking-widest uppercase mb-3 text-cyan-400 flex items-center gap-1.5'>
              <Calendar className="w-3.5 h-3.5" /> Rotinas & Agenda
            </h2>
            
            <div className='space-y-2.5 flex-1 overflow-y-auto pr-1'>
              <div className='bg-cyan-500/5 p-2.5 border-l-2 border-cyan-400'>
                <div className='text-[9px] font-mono text-cyan-400/70 mb-0.5'>SINCRONIZAÇÃO AUTÔNOMA</div>
                <div className='text-xs font-medium text-cyan-100'>Verificação de Agenda Google</div>
                <div className='text-[9px] opacity-50 mt-1'>Permissão para criar eventos sob confirmação</div>
              </div>

              <div className='bg-cyan-500/5 p-2.5 border-l-2 border-cyan-600'>
                <div className='text-[9px] font-mono text-cyan-400/70 mb-0.5'>BUSCA DOCUMENTAL</div>
                <div className='text-xs font-medium text-cyan-100'>Indexação Google Drive</div>
                <div className='text-[9px] opacity-50 mt-1'>Acesso a relatórios e arquivos via voz</div>
              </div>

              <div className='bg-cyan-500/5 p-2.5 border-l-2 border-green-500'>
                <div className='text-[9px] font-mono text-green-400 mb-0.5'>MEMÓRIA DINÂMICA</div>
                <div className='text-xs font-medium text-cyan-100'>Aprendizado Contínuo</div>
                <div className='text-[9px] opacity-50 mt-1'>Preferências e rotinas gravadas em nuvem</div>
              </div>
            </div>

            {/* Sensors Status Display */}
            <h2 className='text-[10px] font-bold tracking-widest uppercase mt-4 mb-2 text-cyan-400'>Sensores Acústicos</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn(
                "flex flex-col items-center justify-center p-3 border rounded-sm transition-all",
                isListening && !isMicMuted
                  ? "border-cyan-400 bg-cyan-950/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]" 
                  : "border-cyan-800/40 bg-cyan-950/10 text-cyan-700"
              )}>
                <Mic className="w-4 h-4 mb-1" />
                <span className="text-[9px] uppercase font-mono">Microfone {isListening && !isMicMuted ? 'Ativo' : 'Pausado'}</span>
              </div>

              <div className={cn(
                "flex flex-col items-center justify-center p-3 border rounded-sm transition-all",
                isSpeaking 
                  ? "border-green-400 bg-green-950/30 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]" 
                  : "border-cyan-800/40 bg-cyan-950/10 text-cyan-700"
              )}>
                <Volume2 className="w-4 h-4 mb-1" />
                <span className="text-[9px] uppercase font-mono">Voz {isSpeaking ? 'Falando' : 'Mudo'}</span>
              </div>
            </div>
          </div>
          
          {/* Audit Telemetry */}
          <div className='bg-cyan-950/10 border border-cyan-500/20 p-3 h-36 overflow-hidden rounded-sm'>
            <h2 className='text-[10px] font-bold tracking-widest uppercase mb-2 text-cyan-400'>Telemetria Stark OS</h2>
            <div className='font-mono text-[9px] opacity-60 space-y-1'>
              <div>[NÚCLEO]: Gemini 3.1 Flash Live (Baixa Latência)</div>
              <div>[CANAL]: WebSocket full-duplex /live</div>
              <div>[ÁUDIO]: Entrada 16kHz PCM | Saída 24kHz PCM</div>
              <div>[SEGURANÇA]: Protocolo com Confirmação Manual</div>
              <div>[LOCALIZAÇÃO]: pt-BR Português Brasil</div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className='mt-3 pt-2 border-t border-cyan-500/20 flex flex-wrap justify-between items-center text-[9px] tracking-widest uppercase opacity-40 z-10 font-mono'>
        <div>Maria AI SYSTEM | ARQUITETURA AUTÔNOMA</div>
        <div>STARK INDUSTRIES HUD SPECIFICATION</div>
      </footer>

      {/* CONFIRMATION DIALOG MODAL */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-md p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="border-2 border-cyan-400 bg-cyan-950/90 p-6 rounded-sm w-full max-w-md shadow-[0_0_40px_rgba(0,212,255,0.3)]"
            >
              <h3 className="text-cyan-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2 text-sm">
                <Shield className="w-5 h-5 text-yellow-400" /> Autorização do Operador Necessária
              </h3>
              <p className="text-cyan-100 text-xs mb-3 leading-relaxed">
                MARIA está solicitando sua autorização para executar uma operação externa:
              </p>
              
              <div className="bg-black/60 p-3 rounded mb-4 font-mono text-[11px] text-cyan-300 border border-cyan-800/60 overflow-x-auto">
                <span className="text-cyan-400 font-bold block mb-1">Ação Solicitada:</span> 
                {confirmDialog.action === 'create_calendar_event' ? 'Criar Evento no Google Agenda' : confirmDialog.action}
                <div className="mt-2 text-cyan-200">
                  <span className="text-cyan-500 font-bold block mb-0.5">Parâmetros:</span>
                  <pre className="whitespace-pre-wrap text-[10px]">{JSON.stringify(confirmDialog.args, null, 2)}</pre>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => handleConfirm(true)} 
                  className="flex-1 border-2 border-cyan-400 bg-cyan-500/20 hover:bg-cyan-400 hover:text-black text-cyan-300 py-2.5 uppercase font-bold text-xs tracking-widest transition-all cursor-pointer"
                >
                  Autorizar
                </button>
                <button 
                  onClick={() => handleConfirm(false)} 
                  className="flex-1 border border-red-500/60 hover:bg-red-500/20 text-red-400 py-2.5 uppercase font-bold text-xs tracking-widest transition-all cursor-pointer"
                >
                  Recusar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DESKTOP BRIDGE MODAL */}
      <DesktopBridgeModal 
        isOpen={isDesktopModalOpen}
        onClose={() => setIsDesktopModalOpen(false)}
        mode={desktopMode}
        stats={desktopStats}
        onLog={addLog}
      />
    </div>
  );
}
