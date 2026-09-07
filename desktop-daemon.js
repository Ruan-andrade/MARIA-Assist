#!/usr/bin/env node
/**
 * J.A.R.V.I.S. Local Desktop Daemon / Bridge
 * 
 * Permite que a interface do Jarvis (web ou app) controle o seu computador localmente:
 * - Abrir navegadores nativos (Chrome, Edge, etc.)
 * - Executar comandos no terminal (PowerShell, CMD, Bash)
 * - Criar e gerenciar pastas e arquivos no seu disco
 * - Monitorar recursos do sistema operacional
 */

import { WebSocketServer } from 'ws';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import open from 'open';

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

console.log('====================================================');
console.log('       J.A.R.V.I.S. DESKTOP DAEMON v1.0            ');
console.log('====================================================');
console.log(`[STATUS]: Servidor local aguardando conexão em ws://127.0.0.1:${PORT}`);
console.log(`[HOST]: ${os.hostname()} (${os.platform()} ${os.arch()})`);
console.log(`[ATALHO]: Abra o Jarvis no navegador para vincular seu PC.`);
console.log('----------------------------------------------------');

wss.on('connection', (ws) => {
  console.log('[CONECTADO]: Interface do Jarvis conectada com sucesso ao seu PC.');

  // Send system handshake
  const handshake = {
    type: 'handshake',
    system: {
      platform: os.platform(),
      hostname: os.hostname(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemoryGB: +(os.totalmem() / (1024 ** 3)).toFixed(2),
      freeMemoryGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
      uptimeHours: +(os.uptime() / 3600).toFixed(1)
    }
  };
  ws.send(JSON.stringify(handshake));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[AÇÃO RECEBIDA]: ${msg.name || msg.type}`, msg.args || '');

      if (msg.type === 'get_system_info') {
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'response',
          result: {
            platform: os.platform(),
            hostname: os.hostname(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemoryGB: +(os.totalmem() / (1024 ** 3)).toFixed(2),
            freeMemoryGB: +(os.freemem() / (1024 ** 3)).toFixed(2),
            uptimeHours: +(os.uptime() / 3600).toFixed(1)
          }
        }));
        return;
      }

      if (msg.name === 'open_browser') {
        let url = msg.args?.url || 'https://www.google.com';
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        await open(url);
        console.log(`[NAVEGADOR]: Aberto com sucesso -> ${url}`);
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'response',
          success: true,
          result: `Navegador aberto no endereço: ${url}`
        }));
        return;
      }

      if (msg.name === 'execute_pc_command') {
        const cmd = msg.args?.command;
        if (!cmd) {
          ws.send(JSON.stringify({ id: msg.id, type: 'response', success: false, error: 'Comando não fornecido.' }));
          return;
        }

        exec(cmd, { timeout: 20000 }, (err, stdout, stderr) => {
          if (err) {
            console.error(`[ERRO COMANDO]:`, err.message);
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: false, error: err.message, stderr }));
          } else {
            const out = stdout.trim() || stderr.trim() || 'Comando finalizado.';
            console.log(`[COMANDO EXECUTADO]: ${cmd}`);
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: out }));
          }
        });
        return;
      }

      if (msg.name === 'manage_local_filesystem') {
        const { action, path: targetPath, content } = msg.args || {};
        const resolvedPath = path.isAbsolute(targetPath) 
          ? targetPath 
          : path.join(os.homedir(), targetPath);

        try {
          if (action === 'create_folder') {
            await fs.mkdir(resolvedPath, { recursive: true });
            console.log(`[PASTA CRIADA]: ${resolvedPath}`);
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: `Pasta criada em: ${resolvedPath}` }));
          } else if (action === 'create_file') {
            await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
            await fs.writeFile(resolvedPath, content || '', 'utf-8');
            console.log(`[ARQUIVO CRIADO]: ${resolvedPath}`);
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: `Arquivo salvo em: ${resolvedPath}` }));
          } else if (action === 'read_file') {
            const data = await fs.readFile(resolvedPath, 'utf-8');
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: data.slice(0, 4000) }));
          } else if (action === 'list_dir') {
            const files = await fs.readdir(resolvedPath);
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: files }));
          } else {
            ws.send(JSON.stringify({ id: msg.id, type: 'response', success: false, error: 'Ação não suportada.' }));
          }
        } catch (fsErr) {
          ws.send(JSON.stringify({ id: msg.id, type: 'response', success: false, error: fsErr.message }));
        }
        return;
      }

      if (msg.name === 'search_web_autonomous') {
        const query = msg.args?.query;
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query || '')}`;
        await open(searchUrl);
        ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, result: `Pesquisa aberta para: ${query}` }));
        return;
      }

    } catch (e) {
      console.error('[ERRO PROCESSAMENTO]:', e);
    }
  });

  ws.on('close', () => {
    console.log('[DESCONECTADO]: Interface do Jarvis desconectada.');
  });
});
