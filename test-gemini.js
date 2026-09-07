import { GoogleGenAI } from "@google/genai";
import { Modality } from "@google/genai/dist/types";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    const session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
        systemInstruction: `You are MARIA.`,
      },
    });
    console.log("Connected successfully!");
    session.send({
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: "O usuário acabou de se conectar" }]
        }],
        turnComplete: true
      }
    });
    
    session.on("message", (msg) => {
        console.log("Msg:", msg);
    });
    session.on("close", (e) => {
        console.log("Closed:", e);
    });
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
