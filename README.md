# MARIA - Autonomous AI OS

<div align="center">
  <h3>Inteligência Artificial Autônoma com Conexão Neural e Controle de Casa Inteligente</h3>
  <p>Desenvolvido por <b>RS Sistemas</b> | CEO: Ruan Andrade</p>
</div>

---

## 🧠 Sobre a MARIA
A **MARIA** (Assistente Pessoal Autônoma Inteligente) é um sistema completo e responsivo, alimentado pela API do Google Gemini Live. Ela foi desenhada para processar voz em tempo real através de WebSockets (full-duplex) e pode ser acessada tanto por aplicativos nativos no Desktop (Windows) quanto via PWA em celulares.

## ⚙️ Principais Funcionalidades
- **Conexão Neural de Áudio:** Streaming bidirecional de voz (Gemini Live) permitindo conversas naturais com a assistente, sem necessidade de enviar mensagens de texto.
- **Integração Tuya Smart (Casa Inteligente):** Controle automático de lâmpadas, tomadas, ventiladores e aparelhos I2go e Smart Life diretamente pela voz. Detecção automática do tipo de dispositivo (switch_1, switch_led, etc).
- **Controle Local de Computador:** Quando rodando em modo Desktop (Electron), possui acesso ao hardware local para abrir aplicativos, criar pastas, criar arquivos e realizar buscas autônomas na web.
- **Suporte a PWA:** Instalável nativamente em celulares (iOS/Android) fornecendo a mesma interface e funcionalidades web em qualquer lugar do mundo.

## 🚀 Arquitetura e Tecnologias
Este projeto opera com um servidor Node.js/Express e um frontend Vite + React.
- **Frontend:** React, Tailwind CSS, Vite, Vite-PWA
- **Backend:** Node.js, Express, WebSocket (`ws`), esbuild
- **Inteligência:** `@google/genai` (Gemini Live API)
- **Integração de IoT:** `@tuya/tuya-connector-nodejs`
- **Desktop:** Electron, IPC, empacotamento standalone

## 🛠️ Instalação e Deploy (Render.com)

A aplicação foi estruturada para hospedar Frontend e Backend no mesmo servidor. Siga os passos para subir no Render:

1. Acesse o [Render.com](https://render.com/) e crie um **Web Service**.
2. Conecte este repositório.
3. Configure o Build e o Start:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Na seção **Environment Variables**, adicione suas chaves secretas:
   - `GEMINI_API_KEY`: Sua chave de acesso do Google AI Studio.
   - `TUYA_CLIENT_ID`: Access ID / Client ID da plataforma Tuya IoT.
   - `TUYA_CLIENT_SECRET`: Secret Key da plataforma Tuya IoT.
   - `TUYA_REGION`: Ex: `us` (Depende do seu Data Center).
   - `TUYA_UID`: O ID do seu usuário vinculado no Smart Life.

## 🔒 Privacidade
Este repositório não deve conter chaves expostas no código. As chaves devem estar no arquivo `.env.local` em modo de desenvolvimento, o qual já está protegido pelo `.gitignore`.
