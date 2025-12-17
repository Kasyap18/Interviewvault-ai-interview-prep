
export enum UserType {
  STUDENT = 'Student / Intern',
  FRESHER = 'Fresher',
  EXPERIENCED = 'Experienced Professional',
  SENIOR = 'Senior/Managerial',
}

export type View = 'auth' | 'userTypeSelector' | 'dashboard';

export type AuthMode = 'login' | 'signup';

export type NavItemId = 'qa-generator' | 'know-your-job' | 'resume-checker' | 'interview-prep';

export interface QuestionAndAnswer {
  question: string;
  answer: string;
}

export interface JobSuggestion {
  title: string;
  description: string;
}

export interface ResumeFeedback {
  atsScore: number;
  feedback: {
    clarity: string;
    structure: string;
    grammar: string;
    roleFit: string;
  };
  enhancedResume: string;
}

export interface InterviewPrep {
    companyInsights: string;
    roleSpecificSkills: string[];
    commonQuestions: string[];
    externalResources: {
        title: string;
        url: string;
    }[];
}
