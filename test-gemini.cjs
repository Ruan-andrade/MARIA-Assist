const { GoogleGenAI, Modality } = require("@google/genai");
require("dotenv").config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
        systemInstruction: `You are MARIA.`,
      },
    });
    console.log("Connected successfully!");
    
    session.on("message", (msg) => {
        console.log("Msg:", JSON.stringify(msg, null, 2));
    });
    session.on("close", (e) => {
        console.log("Closed:", e);
    });
    session.on("error", (e) => {
        console.log("Error:", e);
    });
    
    session.send({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: "O usuário acabou de se conectar" }]
        }],
        turnComplete: true
      }
    });

  } catch (e) {
    console.error("Error connecting:", e);
  }
}

test();
