import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Laptop, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Copy, 
  Check, 
  ExternalLink, 
  FolderPlus, 
  Cpu, 
  RefreshCw,
  X,
  Download,
  Box,
  HelpCircle,
  FileCode2
} from 'lucide-react';
import { desktopBridge, DesktopMode } from '../lib/desktopBridge';
import { SystemStats } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mode: DesktopMode;
  stats: SystemStats | null;
  onLog: (msg: string) => void;
}

export function DesktopBridgeModal({ isOpen, onClose, mode, stats, onLog }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadBatchFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onLog(`Arquivo ${filename} baixado com sucesso.`);
  };

  const scriptGerarExe = `@echo off\r\ntitle Gerador do Instalador MARIA\r\ncolor 0b\r\necho Compilando frontend e empacotando instalador para Windows (.exe)...\r\ncall npm install\r\ncall npm run dist:win\r\necho Instalador gerado na pasta release\\!\r\nexplorer release\r\npause`;
  const scriptIniciarMaria = `@echo off\r\ntitle MARIA Protocolo Local\r\ncolor 0b\r\ncall npm run electron\r\npause`;
  const scriptIniciarDaemon = `@echo off\r\ntitle MARIA Daemon Local\r\ncolor 0b\r\nnode desktop-daemon.js\r\npause`;

  const handleTestBrowser = async () => {
    setTesting(true);
    onLog('Testando abertura do navegador no PC local...');
    const res = await desktopBridge.executeAction('open_browser', { url: 'https://google.com' });
    onLog(res.success ? `Navegador: ${res.result}` : `Erro: ${res.error}`);
    setTesting(false);
  };

  const handleTestFolder = async () => {
    setTesting(true);
    onLog('Testando criação de pasta no sistema de arquivos local...');
    const res = await desktopBridge.executeAction('manage_local_filesystem', {
      action: 'create_folder',
      path: 'Maria_Workspace'
    });
    onLog(res.success ? `Sistema de Arquivos: ${res.result}` : `Erro: ${res.error}`);
    setTesting(false);
  };

  const handleTestCommand = async () => {
    setTesting(true);
    onLog('Testando execução de comando no terminal do PC...');
    const isWin = navigator.userAgent.includes('Windows');
    const cmd = isWin ? 'echo MARIA Protocolo Local Online' : 'echo "MARIA Local Online"';
    const res = await desktopBridge.executeAction('execute_pc_command', { command: cmd });
    onLog(res.success ? `Saída do Terminal: ${res.result}` : `Erro: ${res.error}`);
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center backdrop-blur-md p-4 selection:bg-cyan-900">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="border-2 border-cyan-400 bg-cyan-950/95 p-6 rounded-sm w-full max-w-2xl shadow-[0_0_50px_rgba(0,212,255,0.25)] flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-cyan-500/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border border-cyan-400/50 bg-cyan-900/40 flex items-center justify-center rounded">
              <Laptop className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest uppercase text-cyan-300">
                Integração Local com seu PC (Desktop Bridge)
              </h2>
              <p className="text-[11px] text-cyan-500 font-mono">
                Permite ao MARIA abrir navegadores, criar arquivos e rodar comandos nativamente.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-cyan-400 hover:text-white p-1 hover:bg-cyan-900/50 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="my-4 p-3 border rounded bg-black/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {mode === 'electron' ? (
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : mode === 'daemon' ? (
              <CheckCircle2 className="w-5 h-5 text-cyan-400 animate-pulse" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            )}
            <div>
              <div className="text-xs font-bold uppercase font-mono tracking-wider">
                {mode === 'electron' && <span className="text-green-400">APLICATIVO NATIVO ELECTRON ATIVO</span>}
                {mode === 'daemon' && <span className="text-cyan-400">DAEMON LOCAL CONECTADO AO PC FÍSICO</span>}
                {mode === 'simulation' && <span className="text-yellow-400">MODO NAVEGADOR (SANDBOX NUVEM)</span>}
              </div>
              <div className="text-[10px] text-cyan-400/70 font-mono">
                {mode === 'simulation' 
                  ? 'Para o Maria controlar o seu PC físico, inicie o Daemon ou o App Electron.' 
                  : `Conectado ao host: ${stats?.hostname || 'Computador Local'} (${stats?.platform || 'OS Nativo'})`}
              </div>
            </div>
          </div>

          <button
            onClick={() => desktopBridge.checkEnvironment()}
            className="border border-cyan-500/40 hover:border-cyan-400 text-cyan-400 text-[10px] uppercase font-mono px-2.5 py-1.5 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reconectar</span>
          </button>
        </div>

        {/* Content Tabs / Instructions */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          
          {/* Quick Hardware Stats if connected */}
          {stats && (
            <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded font-mono text-[11px] grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-cyan-600 block text-[9px] uppercase">Plataforma</span>
                <span className="text-cyan-200">{stats.platform} ({stats.arch})</span>
              </div>
              <div>
                <span className="text-cyan-600 block text-[9px] uppercase">Processador</span>
                <span className="text-cyan-200">{stats.cpus} Núcleos CPU</span>
              </div>
              <div>
                <span className="text-cyan-600 block text-[9px] uppercase">Memória RAM</span>
                <span className="text-cyan-200">{stats.freeMemoryGB}GB / {stats.totalMemoryGB}GB</span>
              </div>
              <div>
                <span className="text-cyan-600 block text-[9px] uppercase">Uptime PC</span>
                <span className="text-cyan-200">{stats.uptimeHours} Horas</span>
              </div>
            </div>
          )}

          {/* Setup Instructions */}
          <div className="space-y-3">
            {/* Why installer cloud explanation */}
            <div className="p-3 bg-cyan-950/60 border border-cyan-400/40 rounded space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs uppercase font-mono">
                <Box className="w-4 h-4 text-cyan-400" />
                <span>Instalador Nativo do Windows (.EXE)</span>
              </div>
              <p className="text-cyan-200/90 text-[11px] leading-relaxed">
                O Google AI Studio roda em servidores isolados na nuvem e não pode gravar arquivos diretamente no seu disco <code className="text-cyan-300 bg-black/40 px-1 rounded">C:\</code>. 
                Por isso, preparamos o motor <strong className="text-cyan-300 font-mono">electron-builder</strong> para você gerar o instalador <strong className="text-white font-mono">MARIA Setup.exe</strong> no seu computador com 1 clique:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="p-2 bg-black/70 border border-cyan-500/30 rounded text-[11px] space-y-1">
                  <div className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                    <span>1. Baixar Projeto Completo</span>
                  </div>
                  <p className="text-cyan-300/70 text-[10px]">
                    No menu superior do Google AI Studio, clique em <strong className="text-white">Settings/Menu ⋮ &rarr; Export ZIP</strong> ou clone do GitHub.
                  </p>
                </div>

                <div className="p-2 bg-black/70 border border-cyan-500/30 rounded text-[11px] space-y-1">
                  <div className="font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                    <span>2. Gerar o Instalador .EXE</span>
                  </div>
                  <p className="text-cyan-300/70 text-[10px]">
                    Na pasta descompactada, execute o script <code className="text-cyan-300">gerar-instalador-exe.bat</code> ou o comando abaixo:
                  </p>
                </div>
              </div>

              <div className="bg-black/90 p-2.5 rounded font-mono text-cyan-300 border border-cyan-900/60 flex justify-between items-center text-[11px]">
                <code>npm run dist:win</code>
                <button 
                  onClick={() => copyToClipboard('npm run dist:win', 'distwin')}
                  className="text-cyan-400 hover:text-cyan-200 flex items-center gap-1 font-mono text-[10px] ml-2 shrink-0"
                >
                  {copied === 'distwin' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied === 'distwin' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => downloadBatchFile('gerar-instalador-exe.bat', scriptGerarExe)}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400 text-cyan-300 hover:text-white px-3 py-1.5 rounded text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar script "gerar-instalador-exe.bat"</span>
                </button>
                <button
                  onClick={() => downloadBatchFile('iniciar-Maria.bat', scriptIniciarMaria)}
                  className="bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 hover:text-white px-3 py-1.5 rounded text-[10px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar "iniciar-Maria.bat"</span>
                </button>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase text-cyan-300 tracking-wider flex items-center gap-2 pt-1">
              <Terminal className="w-4 h-4 text-cyan-400" /> Outras Formas de Execução no seu PC
            </h3>

            {/* Method A: Daemon */}
            <div className="p-3 bg-black/60 border border-cyan-500/20 rounded space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-cyan-400 font-mono text-[11px]">Modo Rápido: Daemon Bridge (Sem compilar nada)</span>
                <button 
                  onClick={() => copyToClipboard('node desktop-daemon.js', 'daemon')}
                  className="text-cyan-400 hover:text-cyan-200 flex items-center gap-1 font-mono text-[10px]"
                >
                  {copied === 'daemon' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied === 'daemon' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-cyan-200/80 text-[11px] leading-relaxed">
                Roda um servidor websocket ultra-leve no seu PC em <code className="text-cyan-300">ws://127.0.0.1:8765</code>. O Maria nesta página conecta-se na hora e ganha controle do sistema:
              </p>
              <div className="bg-black/90 p-2.5 rounded font-mono text-cyan-300 border border-cyan-900/60 flex justify-between items-center text-[11px]">
                <code>node desktop-daemon.js</code>
                <button
                  onClick={() => downloadBatchFile('iniciar-daemon.bat', scriptIniciarDaemon)}
                  className="text-cyan-400 hover:text-white flex items-center gap-1 text-[10px]"
                  title="Baixar arquivo de inicialização direta"
                >
                  <Download className="w-3 h-3" />
                  <span>Baixar .bat</span>
                </button>
              </div>
            </div>

            {/* Method B: Electron dev */}
            <div className="p-3 bg-black/60 border border-cyan-500/20 rounded space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-cyan-400 font-mono text-[11px]">Modo Janela Electron Nativa (Atalho Ctrl+Shift+J)</span>
                <button 
                  onClick={() => copyToClipboard('npm run electron', 'electron')}
                  className="text-cyan-400 hover:text-cyan-200 flex items-center gap-1 font-mono text-[10px]"
                >
                  {copied === 'electron' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied === 'electron' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-cyan-200/80 text-[11px] leading-relaxed">
                Abre a interface como janela de desktop independente com suporte à bandeja do sistema e atalho global:
              </p>
              <div className="bg-black/90 p-2.5 rounded font-mono text-cyan-300 border border-cyan-900/60 flex justify-between items-center text-[11px]">
                <code>npm run electron</code>
              </div>
            </div>
          </div>

          {/* Test Operations */}
          <div className="pt-2 border-t border-cyan-500/20">
            <h3 className="text-xs font-bold uppercase text-cyan-300 tracking-wider mb-2 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" /> Testar Automações no seu PC Agora
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                disabled={testing}
                onClick={handleTestBrowser}
                className="p-2.5 border border-cyan-500/40 hover:border-cyan-300 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-200 rounded text-left transition-all cursor-pointer font-mono"
              >
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-cyan-400 mb-1">
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir Navegador
                </div>
                <div className="text-[10px] opacity-70">Abre o Chrome/Edge com Google</div>
              </button>

              <button
                disabled={testing}
                onClick={handleTestFolder}
                className="p-2.5 border border-cyan-500/40 hover:border-cyan-300 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-200 rounded text-left transition-all cursor-pointer font-mono"
              >
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-cyan-400 mb-1">
                  <FolderPlus className="w-3.5 h-3.5" /> Criar Pasta
                </div>
                <div className="text-[10px] opacity-70">Cria pasta Maria_Workspace</div>
              </button>

              <button
                disabled={testing}
                onClick={handleTestCommand}
                className="p-2.5 border border-cyan-500/40 hover:border-cyan-300 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-200 rounded text-left transition-all cursor-pointer font-mono"
              >
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-cyan-400 mb-1">
                  <Terminal className="w-3.5 h-3.5" /> Rodar Comando
                </div>
                <div className="text-[10px] opacity-70">Executa echo no terminal local</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Close */}
        <div className="mt-4 pt-3 border-t border-cyan-500/30 flex justify-end">
          <button
            onClick={onClose}
            className="border-2 border-cyan-400 bg-cyan-500/20 hover:bg-cyan-400 hover:text-black text-cyan-300 px-6 py-2 text-xs uppercase font-bold tracking-wider transition-all cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>
      </motion.div>
    </div>
  );
}
