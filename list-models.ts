import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyAyKiTcSLqPr25DGV7tzivuh-KwoUhcWnA";
const ai = new GoogleGenAI({ apiKey });

async function listModels() {
    console.log("Listing models...");
    try {
        const response = await ai.models.list();
        // The response might be an async iterable or an object depending on SDK version
        // For @google/genai, it usually returns a ListModelsResponse
        console.log("Models found:");
        // Check structure
        if (response.models) {
            response.models.foreach(m => console.log(m.name));
        } else {
            // Try iterating if it's iterable
            for await (const model of response) {
                console.log(model.name);
            }
        }
    } catch (e) {
        console.log("Failed to list models.");
        console.log(e.message);
    }
}

listModels();
