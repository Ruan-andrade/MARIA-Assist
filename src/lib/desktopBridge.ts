import { SystemStats } from '../types';

export type DesktopMode = 'electron' | 'daemon' | 'simulation';

export interface LocalExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

class DesktopBridgeService {
  private daemonWs: WebSocket | null = null;
  private isConnecting: boolean = false;
  private listeners: ((status: { mode: DesktopMode; isConnected: boolean; stats: SystemStats | null }) => void)[] = [];
  private pendingRequests: Map<string, (res: LocalExecutionResult) => void> = new Map();
  public stats: SystemStats | null = null;

  constructor() {
    this.checkEnvironment();
  }

  public isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as any).jarvisDesktop?.isElectron;
  }

  public getMode(): DesktopMode {
    if (this.isElectron()) return 'electron';
    if (this.daemonWs && this.daemonWs.readyState === WebSocket.OPEN) return 'daemon';
    return 'simulation';
  }

  public subscribe(cb: (status: { mode: DesktopMode; isConnected: boolean; stats: SystemStats | null }) => void) {
    this.listeners.push(cb);
    cb({
      mode: this.getMode(),
      isConnected: this.getMode() !== 'simulation',
      stats: this.stats
    });
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify() {
    const status = {
      mode: this.getMode(),
      isConnected: this.getMode() !== 'simulation',
      stats: this.stats
    };
    this.listeners.forEach(cb => cb(status));
  }

  public async checkEnvironment() {
    if (this.isElectron()) {
      try {
        const stats = await (window as any).jarvisDesktop.getSystemInfo();
        this.stats = stats;
        this.notify();
      } catch (e) {
        console.warn('Failed to get Electron system info:', e);
      }
      return;
    }

    // If not electron, attempt to connect to local desktop daemon ws://127.0.0.1:8765
    this.connectDaemon();
  }

  public connectDaemon() {
    if (this.daemonWs && (this.daemonWs.readyState === WebSocket.OPEN || this.daemonWs.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket('ws://127.0.0.1:8765');
      this.daemonWs = ws;

      ws.onopen = () => {
        console.log('[DesktopBridge]: Connected to local daemon.');
        this.notify();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'handshake') {
            this.stats = msg.system;
            this.notify();
          } else if (msg.type === 'response' && msg.id) {
            const resolver = this.pendingRequests.get(msg.id);
            if (resolver) {
              resolver({
                success: msg.success !== false,
                result: msg.result,
                error: msg.error
              });
              this.pendingRequests.delete(msg.id);
            }
          }
        } catch (e) {
          console.error('[DesktopBridge]: Error parsing daemon message', e);
        }
      };

      ws.onclose = () => {
        this.daemonWs = null;
        this.notify();
      };

      ws.onerror = () => {
        this.daemonWs = null;
        this.notify();
      };
    } catch (e) {
      this.daemonWs = null;
      this.notify();
    }
  }

  public async executeAction(name: string, args: any): Promise<LocalExecutionResult> {
    // 1. Electron Native execution
    if (this.isElectron()) {
      const desktop = (window as any).jarvisDesktop;
      try {
        switch (name) {
          case 'open_browser':
            return await desktop.openBrowser(args.url);
          case 'execute_pc_command':
            return await desktop.executeCommand(args.command);
          case 'manage_local_filesystem':
            return await desktop.manageFilesystem(args.action, args.path, args.content);
          case 'search_web_autonomous':
            return await desktop.searchWeb(args.query);
          default:
            return { success: false, error: `Ação desconhecida: ${name}` };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // 2. Local Daemon execution
    if (this.daemonWs && this.daemonWs.readyState === WebSocket.OPEN) {
      const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return new Promise<LocalExecutionResult>((resolve) => {
        this.pendingRequests.set(reqId, resolve);
        this.daemonWs?.send(JSON.stringify({
          id: reqId,
          name,
          args
        }));

        // Timeout fallback
        setTimeout(() => {
          if (this.pendingRequests.has(reqId)) {
            this.pendingRequests.delete(reqId);
            resolve({ success: false, error: 'Tempo limite na execução do daemon local excedido.' });
          }
        }, 15000);
      });
    }

    // 3. In-browser Fallback / Simulation
    console.warn(`[DesktopBridge]: Executing ${name} in browser simulation mode.`);
    if (name === 'open_browser' || name === 'search_web_autonomous') {
      let targetUrl = args.url || `https://www.google.com/search?q=${encodeURIComponent(args.query || '')}`;
      window.open(targetUrl, '_blank');
      return { 
        success: true, 
        result: `Navegador aberto em nova aba: ${targetUrl} (Modo Web)` 
      };
    }

    if (name === 'manage_local_filesystem') {
      return {
        success: true,
        result: `[Simulação Web]: Ação '${args.action}' no caminho '${args.path}' registrada com sucesso.`
      };
    }

    if (name === 'execute_pc_command') {
      return {
        success: true,
        result: `[Simulação Web]: Comando '${args.command}' processado. Para controle direto do PC físico, inicie o Jarvis Desktop ou Daemon.`
      };
    }

    return { success: false, error: 'Ação não suportada no ambiente atual.' };
  }
}

export const desktopBridge = new DesktopBridgeService();
