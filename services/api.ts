import axios from 'axios';
import { UserType } from '../types';

const API_BASE_URL = 'http://localhost:8000/api/interview';

export interface SetupOptions {
    mode: 'resume_role' | 'domain_topic';
    difficulty: 'standard' | 'challenging' | 'expert';
    targetRole?: string;
    domain?: string;
    topic?: string;
    file?: File;
}

export interface EvaluationResult {
    score: number;
    feedback: string;
    strengths: string[];
    improvements: string[];
}

export interface AnswerResponse {
    evaluation: EvaluationResult;
    isCompleted: boolean;
    nextQuestion?: {
        number: number;
        text: string;
    };
}

export interface InterviewSession {
    _id: string;
    mode: string;
    difficulty: string;
    overallScore: number;
    status: 'in_progress' | 'completed';
    createdAt: string;
    context: any;
    questions: {
        questionNumber: number;
        questionText: string;
        userAnswer?: string;
        evaluation?: EvaluationResult;
    }[];
}


export const interviewApi = {

    initInterview: async (options: SetupOptions) => {
        const formData = new FormData();
        formData.append('mode', options.mode);
        formData.append('difficulty', options.difficulty);

        if (options.mode === 'resume_role') {
            if (options.targetRole) formData.append('targetRole', options.targetRole);
            if (options.file) formData.append('file', options.file);
        } else {
            if (options.domain) formData.append('domain', options.domain);
            if (options.topic) formData.append('topic', options.topic);
        }

        const response = await axios.post(`${API_BASE_URL}/init`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data; // { sessionId, questionNumber, questionText }
    },

    submitAnswer: async (sessionId: string, answer: string): Promise<AnswerResponse> => {
        const response = await axios.post(`${API_BASE_URL}/${sessionId}/answer`, { answer });
        return response.data;
    },

    getReport: async (sessionId: string): Promise<InterviewSession> => {
        const response = await axios.get(`${API_BASE_URL}/${sessionId}/report`);
        return response.data;
    },

    getHistory: async (): Promise<InterviewSession[]> => {
        const response = await axios.get(`${API_BASE_URL}/history`);
        return response.data;
    }
};
