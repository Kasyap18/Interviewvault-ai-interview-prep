import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyAyKiTcSLqPr25DGV7tzivuh-KwoUhcWnA";
const ai = new GoogleGenAI({ apiKey });

async function testModel(modelName) {
    console.log(`\n--- Testing model: ${modelName} ---`);
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: "Hello",
        });
        console.log(`SUCCESS: ${modelName}`);
        return true;
    } catch (e) {
        console.log(`FAILED: ${modelName}`);
        console.log(`Status: ${e.status || 'unknown'}`);
        // Log short message, not full object
        console.log(`Message: ${e.message?.substring(0, 200)}...`);
        return false;
    }
}

async function main() {
    const candidates = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-001",
        "gemini-1.5-pro",
        "gemini-1.5-pro-001",
        "gemini-2.0-flash-exp",
    ];

    for (const model of candidates) {
        if (await testModel(model)) {
            break;
        }
    }
}

main();
