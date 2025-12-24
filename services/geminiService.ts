import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { UserType, JobSuggestion, ResumeFeedback, InterviewPrep } from '../types';

if (!process.env.API_KEY) {
    console.warn("API_KEY environment variable not set. Using a placeholder. AI features will not work.");
}

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set. Please check your .env file or deployment settings.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateQuestions(
    resumeOrJdText: string,
    userType: UserType,
    techQuestions: number,
    nonTechQuestions: number
): Promise<{ skills: string[], technicalQuestions: string[], nonTechnicalQuestions: string[] }> {
    const prompt = `
      Based on the following document and the user's career level, please perform two tasks:
      1. Extract the top 5-7 key skills (technical and soft skills).
      2. Generate exactly ${techQuestions} technical and ${nonTechQuestions} non-technical interview questions tailored to these skills and the user's level.

      User's Career Level: ${userType}
      Document (Resume or Job Description):
      ---
      ${resumeOrJdText}
      ---
      
      Return a JSON object with keys "skills", "technicalQuestions", and "nonTechnicalQuestions".
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    skills: {
                        type: Type.ARRAY,
                        description: "An array of 5-7 key skills extracted from the document.",
                        items: { type: Type.STRING }
                    },
                    technicalQuestions: {
                        type: Type.ARRAY,
                        description: `An array of technical interview questions.`,
                        items: { type: Type.STRING }
                    },
                    nonTechnicalQuestions: {
                        type: Type.ARRAY,
                        description: `An array of non-technical (behavioral, situational) interview questions.`,
                        items: { type: Type.STRING }
                    }
                },
                required: ["skills", "technicalQuestions", "nonTechnicalQuestions"]
            }
        },
    });

    return JSON.parse(response.text);
}

export async function generateAnswer(question: string, contextText: string): Promise<string> {
    const prompt = `
        Given the following context (a resume or job description), provide a concise, well-structured, 100-word model answer for the interview question.
        The answer should be helpful and professional.

        Context:
        ---
        ${contextText}
        ---

        Question: "${question}"

        Return only the model answer text, without any preamble.
    `;
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });
    return response.text;
}

export async function modifyAnswer(question: string, answer: string, modificationType: 'elaborate' | 'shorten'): Promise<string> {
    const prompt = `
      Please ${modificationType} the following answer for the given interview question.
      
      Question: "${question}"
      Original Answer: "${answer}"
      
      If elaborating, add more detail, examples, or context. If shortening, make it more concise and to the point.
      Return only the modified answer text.
    `;
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });
    return response.text;
}

export async function findJobsFromResume(resumeText: string, userType: UserType): Promise<JobSuggestion[]> {
    const prompt = `
      Analyze the following resume for a user who identifies as a '${userType}'.
      Based on their skills and experience, suggest 3-5 suitable job titles.
      For each job title, provide a short, one-sentence description of why it's a good fit.

      Resume Text:
      ---
      ${resumeText}
      ---

      Return the output as a single, valid JSON array with the following structure:
      [
        {"title": "Job Title 1", "description": "Short description for the role."},
        {"title": "Job Title 2", "description": "Short description for the role."},
        ...
      ]
    `;
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });

    return JSON.parse(response.text);
}

export async function findJobsInDomain(domain: string, userType: UserType): Promise<JobSuggestion[]> {
    const prompt = `
        List 5-7 common job titles within the '${domain}' domain, tailored for someone at the '${userType}' career level.
        For each job title, provide a brief, one-sentence description of the role's primary responsibility.

        Return the output as a single, valid JSON array with the following structure:
        [
            {"title": "Job Title 1", "description": "Brief role description."},
            {"title": "Job Title 2", "description": "Brief role description."},
            ...
        ]
    `;
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });

    return JSON.parse(response.text);
}

export async function checkResume(resumeText: string, userType: UserType, targetRole: string): Promise<ResumeFeedback> {
    const prompt = `
      Act as an expert career coach and hiring manager. Analyze the following resume for a '${userType}' targeting a '${targetRole}' position.
      
      Resume Text:
      ---
      ${resumeText}
      ---
      
      Provide a comprehensive review in a single, valid JSON object with this exact structure:
      {
        "atsScore": <An estimated ATS-friendliness score out of 100>,
        "feedback": {
          "clarity": "<Critique on the resume's clarity and conciseness.>",
          "structure": "<Comments on the layout, sections, and flow.>",
          "grammar": "<Notes on grammar, spelling, and professionalism.>",
          "roleFit": "<Analysis of how well the resume is tailored for the target role: '${targetRole}'.>"
        },
        "enhancedResume": "<A rewritten, enhanced version of the resume summary/experience section that is more impactful for the target role. Focus on action verbs and quantifiable achievements.>"
      }
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });

    return JSON.parse(response.text);
}

export async function prepareForInterview(company: string, role: string, userType: UserType): Promise<InterviewPrep> {
    const prompt = `
      Generate a concise interview preparation guide for a '${userType}' candidate interviewing for the '${role}' position at '${company}'.
      
      Provide the output in a single, valid JSON object with the following structure:
      {
        "companyInsights": "<A brief overview of ${company}, its culture, recent news, and what it might look for in a candidate.>",
        "roleSpecificSkills": ["skill1", "skill2", "skill3", ...],
        "commonQuestions": ["Question 1 specific to the role/company...", "Question 2...", ...],
        "externalResources": [
          {"title": "Helpful Article or Video Title 1", "url": "https://example.com/resource1"},
          {"title": "Relevant Tech Documentation or Blog", "url": "https://example.com/resource2"},
          ...
        ]
      }
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" },
    });

    return JSON.parse(response.text);
}