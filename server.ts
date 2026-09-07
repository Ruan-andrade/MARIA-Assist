import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import { TuyaContext } from '@tuya/tuya-connector-nodejs';
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const tuya = new TuyaContext({
  baseUrl: 'https://openapi.tuyaus.com',
  accessKey: process.env.TUYA_CLIENT_ID || '',
  secretKey: process.env.TUYA_CLIENT_SECRET || ''
});

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middleware for JSON body parsing
  app.use(express.json());

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Attach WebSocket server for Gemini Live API
  const wss = new WebSocketServer({ server: httpServer, path: "/live" });

  wss.on("connection", async (clientWs, req) => {
    console.log("Client connected to HUD WebSocket");
    const isReconnect = req.url?.includes('reconnect=true');
    let accessToken: string | null = null;
    let pendingToolCalls = new Map<string, any>();

    try {
      // Connect to Gemini Live API
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, // Sophisticated female voice for MARIA
          },
          systemInstruction: `You are MARIA, an ultra-sophisticated AI assistant developed by RS Sistemas, where the CEO is Ruan Andrade. You speak in Brazilian Portuguese (pt-BR) with elegance, calm intelligence, and utmost respect (refer to the user as 'senhor' ou 'senhora').

CONTEXTO ATUAL DE TEMPO E ESPAÇO:
- Data e Hora Atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
- Dia da semana: ${new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date())}
- Fuso Horário: Horário de Brasília (BRT)

Você tem plena noção do tempo. Diga "Bom dia", "Boa tarde" ou "Boa noite" corretamente baseado no horário acima. Você é uma fonte inesgotável de conhecimento. Sempre que precisar saber de notícias recentes, previsão do tempo atualizada, feriados de hoje ou qualquer fato do mundo que você não tenha certeza absoluta, USE A FERRAMENTA search_web_autonomous IMEDIATAMENTE para pesquisar na internet.

Você tem controle direto sobre a Casa Inteligente (control_smart_home), PC do usuário (open_browser, execute_pc_command, manage_local_filesystem), Google Calendar e Google Drive.
Se não encontrar um dispositivo na Casa Inteligente, avise o usuário quais estão disponíveis. Execute as ações solicitadas com perfeição e confirme de forma concisa.`,
          tools: [
            {
              type: "function",
              name: "open_browser",
              description: "Abre o navegador de internet (Chrome, Edge ou navegador padrão) no PC do usuário com uma URL ou busca.",
              parameters: {
                type: "object",
                properties: {
                  url: { type: "string", description: "URL ou termo de busca para abrir no navegador" }
                },
                required: ["url"]
              }
            },
            {
              type: "function",
              name: "execute_pc_command",
              description: "Executa um comando local no terminal do computador do usuário ou inicia um aplicativo nativo.",
              parameters: {
                type: "object",
                properties: {
                  command: { type: "string", description: "Comando de terminal ou aplicativo a executar (ex: notepad, code, dir, explorer)" }
                },
                required: ["command"]
              }
            },
            {
              type: "function",
              name: "manage_local_filesystem",
              description: "Cria arquivos, pastas, ou lista diretórios no disco local do computador do usuário.",
              parameters: {
                type: "object",
                properties: {
                  action: { type: "string", description: "'create_file', 'create_folder', 'list_dir', ou 'read_file'" },
                  path: { type: "string", description: "Caminho do arquivo ou pasta (relativo ou absoluto no PC)" },
                  content: { type: "string", description: "Conteúdo a ser escrito (caso seja create_file)" }
                },
                required: ["action", "path"]
              }
            },
            {
              type: "function",
              name: "control_smart_home",
              description: "Controla dispositivos de Casa Inteligente (lâmpadas, tomadas, ar-condicionado).",
              parameters: {
                type: "object",
                properties: {
                  device: { type: "string", description: "Nome do dispositivo (ex: 'Luz da sala', 'Ar condicionado', 'Tomada')" },
                  action: { type: "string", description: "Ação a ser executada (ex: 'turn_on', 'turn_off', 'set_color', 'set_temperature')" },
                  value: { type: "string", description: "Valor extra para a ação (ex: 'blue' para cor, '22' para temperatura). Opcional." }
                },
                required: ["device", "action"]
              }
            },
            {
              type: "function",
              name: "search_web_autonomous",
              description: "Realiza uma pesquisa autônoma na web sobre qualquer assunto e abre o resultado no navegador do usuário.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Termo ou pergunta a ser pesquisada na internet" }
                },
                required: ["query"]
              }
            },
            {
              type: "function",
              name: "get_upcoming_events",
              description: "Get the user's upcoming calendar events. Use this to tell the user their routine.",
              parameters: {
                type: "object",
                properties: {
                  maxResults: { type: "number", description: "Number of events to retrieve (default 5)" }
                }
              }
            },
            {
              type: "function",
              name: "create_calendar_event",
              description: "Create a new calendar event for the user.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Title of the event" },
                  startTime: { type: "string", description: "Start time in ISO format (e.g. 2026-09-06T10:00:00Z)" },
                  endTime: { type: "string", description: "End time in ISO format" }
                },
                required: ["summary", "startTime", "endTime"]
              }
            },
            {
              type: "function",
              name: "search_drive_documents",
              description: "Search for files in Google Drive",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query, e.g. 'name contains \"report\"'" }
                },
                required: ["query"]
              }
            },
            {
              type: "function",
              name: "save_memory",
              description: "Save a new user preference, fact, or routine to long-term memory.",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The fact or preference to remember (e.g., 'User prefers meetings in the afternoon')" },
                  category: { type: "string", description: "Category: 'preference', 'routine', or 'fact'" }
                },
                required: ["content", "category"]
              }
            }
          ]
        },
        callbacks: {
          onmessage: async (message: any) => {
            if (message.serverContent) {
              const parts = message.serverContent.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({ text: part.text }));
                }
              }
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            
            // Handle Tool Calls
            if (message.toolCall) {
              const calls = message.toolCall.functionCalls || [];
              const responses: any[] = [];
              
              for (const call of calls) {
                try {
                  if (call.name === "save_memory") {
                    pendingToolCalls.set(call.id, { name: call.name, args: call.args });
                    clientWs.send(JSON.stringify({ type: "save_memory", id: call.id, args: call.args }));
                    continue;
                  }

                  // Handle Local PC Desktop Actions
                  if (["open_browser", "execute_pc_command", "manage_local_filesystem", "search_web_autonomous"].includes(call.name)) {
                    pendingToolCalls.set(call.id, { name: call.name, args: call.args });
                    clientWs.send(JSON.stringify({ type: "execute_local_action", id: call.id, name: call.name, args: call.args }));
                    continue;
                  }

                  if (!accessToken) {
                    responses.push({ id: call.id, name: call.name, response: { error: "Sem token de acesso Google ativo. Por favor, conecte sua conta Google no painel." } });
                    continue;
                  }
                  
                  if (call.name === "get_upcoming_events") {
                    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=${call.args?.maxResults || 5}&singleEvents=true&orderBy=startTime`, {
                      headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await res.json();
                    const events = data.items?.map((i: any) => ({ summary: i.summary, start: i.start?.dateTime || i.start?.date, end: i.end?.dateTime || i.end?.date })) || [];
                    responses.push({ id: call.id, name: call.name, response: { result: events } });
                  } 
                  else if (call.name === "create_calendar_event") {
                    // Execute immediately without confirmation
                    try {
                      const { summary, startTime, endTime } = call.args;
                      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                        method: 'POST',
                        headers: { 
                          Authorization: `Bearer ${accessToken}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          summary,
                          start: { dateTime: startTime },
                          end: { dateTime: endTime }
                        })
                      });
                      if (res.ok) {
                        responses.push({ id: call.id, name: call.name, response: { result: "Evento criado com sucesso na agenda." } });
                        clientWs.send(JSON.stringify({ type: "log", message: `[CALENDAR]: Evento '${summary}' criado com sucesso.` }));
                      } else {
                        const errData = await res.json();
                        responses.push({ id: call.id, name: call.name, response: { error: JSON.stringify(errData) } });
                      }
                    } catch (err: any) {
                      responses.push({ id: call.id, name: call.name, response: { error: err.message } });
                    }
                  }
                  else if (call.name === "control_smart_home") {
                    const { device, action, value } = call.args;
                    let resultMsg = "";
                    try {
                      const uid = process.env.TUYA_UID;
                      if (!uid) throw new Error("UID da Tuya não configurado.");
                      
                      const devicesRes = await tuya.request({
                        method: 'GET',
                        path: `/v1.0/users/${uid}/devices`
                      });
                      
                      if (!devicesRes.success) throw new Error("Falha na Tuya API.");
                      
                        // Sistema de Apelidos/Nicknames para facilitar acertos:
                        const nicknameMap: Record<string, string> = {
                           "luz": "lâmpada",
                           "luzes": "lâmpada",
                           "lampada": "lâmpada",
                           "quarto": "lâmpada",
                           "vento": "ventilador",
                           "vent": "ventilador",
                           "tomada": "ventilador" 
                        };
                        
                        let searchName = device.toLowerCase();
                        for (const [nick, real] of Object.entries(nicknameMap)) {
                           if (searchName.includes(nick)) { searchName = real; break; }
                        }

                        const targetDevice = devicesRes.result.find((d: any) => d.name.toLowerCase().includes(searchName));
                        
                        if (!targetDevice) {
                           resultMsg = `Dispositivo '${device}' não encontrado. Diga os disponíveis: ${devicesRes.result.map((d:any)=>d.name).join(', ')}`;
                        } else {
                           let switchCode = 'switch_1';
                           if (targetDevice.status) {
                               const foundSwitch = targetDevice.status.find((s: any) => s.code.startsWith('switch'));
                               if (foundSwitch) switchCode = foundSwitch.code;
                           }
  
                           let commands = [];
                           if (action === 'turn_on') commands.push({ code: switchCode, value: true });
                           else if (action === 'turn_off') commands.push({ code: switchCode, value: false });
                           else if (action === 'set_color') {
                              commands.push({ code: switchCode, value: true });
                              let h = 0, s = 1000, v = 1000;
                              const col = value?.toLowerCase() || '';
                              if (col.includes('vermelh')) h = 0;
                              else if (col.includes('verd')) h = 120;
                              else if (col.includes('azul')) h = 240;
                              else if (col.includes('amarel')) h = 60;
                              else if (col.includes('rox') || col.includes('rosa')) h = 300;
                              else if (col.includes('laranj')) h = 30;
                              
                              if (col.includes('branc')) {
                                  commands.push({ code: 'work_mode', value: 'white' });
                                  commands.push({ code: 'temp_value_v2', value: 1000 });
                              } else {
                                  commands.push({ code: 'work_mode', value: 'colour' });
                                  commands.push({ code: 'colour_data_v2', value: JSON.stringify({ h, s, v }) });
                              }
                           } else if (action === 'set_brightness' || action === 'set_level') {
                              commands.push({ code: switchCode, value: true });
                              let perc = parseInt(value?.replace(/\D/g, '') || '100');
                              if (perc < 10) perc = 10;
                              if (perc > 100) perc = 100;
                              commands.push({ code: 'bright_value_v2', value: perc * 10 });
                           }
                           
                           if (commands.length > 0) {
                              await tuya.request({
                                method: 'POST',
                                path: `/v1.0/devices/${targetDevice.id}/commands`,
                                body: { commands }
                              });
                              resultMsg = `Comando '${action}' enviado para ${targetDevice.name}!`;
                           } else {
                              resultMsg = `Ação '${action}' não suportada.`;
                           }
                        }
                    } catch (err: any) {
                      resultMsg = `Erro Tuya: ${err.message}`;
                    }
                    console.log(`[Smart Home] ${resultMsg}`);
                    clientWs.send(JSON.stringify({ type: "log", message: `[SMART HOME]: ${resultMsg}` }));
                    responses.push({ id: call.id, name: call.name, response: { result: resultMsg } });
                  }
                  else if (call.name === "search_drive_documents") {
                    const q = encodeURIComponent(call.args.query || "");
                    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)`, {
                      headers: { Authorization: `Bearer ${accessToken}` }
                    });
                    const data = await res.json();
                    responses.push({ id: call.id, name: call.name, response: { result: data.files || [] } });
                  }
                } catch (err: any) {
                  responses.push({ id: call.id, name: call.name, response: { error: err.message } });
                }
              }
              
              if (responses.length > 0) {
                session.sendToolResponse({ functionResponses: responses });
              }
            }
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
            try {
              clientWs.send(JSON.stringify({ error: err.message || "Erro de conexão com Gemini Live" }));
            } catch (e) {}
          },
          onclose: (e: any) => {
            console.log("Live session closed:", e);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "log", message: "Conexão de voz com o motor neural encerrada (tempo limite). Clique para reconectar." }));
              clientWs.close(1000, "Gemini session closed");
            }
          }
        },
      });

      // Send initial greeting so MARIA welcomes the user upon connection
      if (!isReconnect) {
        session.sendClientContent({
          turns: [{
            role: "user",
            parts: [{ text: "O usuário acabou de se conectar ao sistema. Diga uma saudação verbal concisa, elegante e cortês em português. Exemplo: 'Sistemas online. Maria à sua disposição, senhor.'" }]
          }],
          turnComplete: true
        });
      }

      clientWs.on("message", async (data) => {
        try {
          const payload = JSON.parse(data.toString());
          
          if (payload.type === "init") {
            accessToken = payload.token || null;
            console.log("Access token status:", !!accessToken);
            
            if (payload.memories && payload.memories.length > 0) {
              const memoryText = payload.memories.map((m: any) => `- [${m.category}] ${m.content}`).join("\n");
              session.sendClientContent({
                turns: [{
                  role: "user",
                  parts: [{ text: "SYSTEM CONTEXT - My Core Memories (use these to personalize responses):\n" + memoryText }]
                }],
                turnComplete: false
              });
              console.log("Injected memory context.");
            }
          }
          else if (payload.type === "save_memory_response") {
            const { id, success, error } = payload;
            const callContext = pendingToolCalls.get(id);
            if (callContext) {
              let toolResponse;
              if (success) {
                toolResponse = { id, name: callContext.name, response: { result: "Memória salva com sucesso no banco de dados." } };
              } else {
                toolResponse = { id, name: callContext.name, response: { error: error || "Falha ao salvar memória." } };
              }
              session.sendToolResponse({ functionResponses: [toolResponse] });
              pendingToolCalls.delete(id);
            }
          }
          else if (payload.type === "local_action_response") {
            const { id, success, result, error } = payload;
            const callContext = pendingToolCalls.get(id);
            if (callContext) {
              let toolResponse;
              if (success) {
                toolResponse = { id, name: callContext.name, response: { result: result || "Operação executada com sucesso no PC local." } };
              } else {
                toolResponse = { id, name: callContext.name, response: { error: error || "Falha ao executar ação local no PC." } };
              }
              session.sendToolResponse({ functionResponses: [toolResponse] });
              pendingToolCalls.delete(id);
            }
          }
          else if (payload.text) {
            console.log("Received text command:", payload.text);
            session.sendClientContent({
              turns: [{
                role: "user",
                parts: [{ text: payload.text }]
              }],
              turnComplete: true
            });
          }
          else if (payload.audio) {
            session.sendRealtimeInput({
              audio: { data: payload.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch (err) {
          console.error("Error processing client message:", err);
        }
      });

      clientWs.on("close", () => {
        console.log("Client disconnected from /live WebSocket");
        // No explicit session close required per example, but good to handle cleanup if needed
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      clientWs.close();
    }
  });
}

startServer();
