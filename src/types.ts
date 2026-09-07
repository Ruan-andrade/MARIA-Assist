export interface LocalActionRequest {
  id: string;
  name: string;
  args: any;
}

export interface LocalActionResult {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface SystemStats {
  platform: string;
  hostname: string;
  arch: string;
  cpus: number;
  totalMemoryGB: number;
  freeMemoryGB: number;
  uptimeHours: number;
}

export interface DesktopBridgeStatus {
  isElectron: boolean;
  isDaemonConnected: boolean;
  activeMode: 'electron' | 'daemon' | 'simulation';
  systemStats?: SystemStats | null;
}
