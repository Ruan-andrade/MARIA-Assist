const { app, BrowserWindow, ipcMain, shell, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { exec, fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: true,
    backgroundColor: '#03070b',
    title: 'MARIA Autonomous AI OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const appUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';

  const loadApp = () => {
    mainWindow.loadURL(appUrl).catch(() => {
      setTimeout(loadApp, 1000);
    });
  };
  
  if (app.isPackaged) {
    setTimeout(loadApp, 1000); // Wait for forked server
  } else {
    loadApp();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  if (app.isPackaged) {
    const serverPath = path.join(__dirname, '..', 'dist', 'server.cjs');
    serverProcess = fork(serverPath, [], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    });
  }
  
  createWindow();

  // Register Global Shortcut: Ctrl+Shift+J to bring Jarvis to focus
  try {
    globalShortcut.register('CommandOrControl+Shift+J', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    console.log('Global shortcut CommandOrControl+Shift+J registered for Maria.');
  } catch (e) {
    console.warn('Could not register shortcut:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
  }
});

// IPC Handlers for Local PC Automation
ipcMain.handle('jarvis:get-system-info', async () => {
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemoryGB: +(os.totalmem() / (1024 ** 3)).toFixed(2),
    freeMemoryGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
    uptimeHours: +(os.uptime() / 3600).toFixed(1)
  };
});

ipcMain.handle('jarvis:open-browser', async (event, url) => {
  try {
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      // If it looks like a search query
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
    }
    await shell.openExternal(targetUrl);
    return { success: true, message: `Navegador aberto com URL: ${targetUrl}` };
  } catch (error) {
    console.error('Failed to open browser:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('jarvis:execute-command', async (event, command) => {
  return new Promise((resolve) => {
    exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stderr });
      } else {
        resolve({ success: true, output: stdout.trim() || stderr.trim() || 'Comando executado com sucesso.' });
      }
    });
  });
});

ipcMain.handle('jarvis:manage-filesystem', async (event, { action, targetPath, content }) => {
  try {
    // Resolve relative path to user home or current directory
    const resolvedPath = path.isAbsolute(targetPath) 
      ? targetPath 
      : path.join(os.homedir(), targetPath);

    switch (action) {
      case 'create_folder':
        await fs.mkdir(resolvedPath, { recursive: true });
        return { success: true, message: `Pasta criada em: ${resolvedPath}` };

      case 'create_file':
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(resolvedPath, content || '', 'utf-8');
        return { success: true, message: `Arquivo criado em: ${resolvedPath}` };

      case 'read_file':
        const data = await fs.readFile(resolvedPath, 'utf-8');
        return { success: true, content: data.slice(0, 5000) };

      case 'list_dir':
        const files = await fs.readdir(resolvedPath);
        return { success: true, files };

      default:
        return { success: false, error: `Ação desconhecida: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('jarvis:search-web', async (event, query) => {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  await shell.openExternal(searchUrl);
  return { success: true, message: `Pesquisa aberta no navegador: ${query}` };
});

ipcMain.handle('jarvis:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('jarvis:close', () => {
  if (mainWindow) mainWindow.close();
});
