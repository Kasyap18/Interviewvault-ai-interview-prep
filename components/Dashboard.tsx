import React, { useState, useCallback, useMemo } from 'react';
import { UserType, NavItemId, JobSuggestion, ResumeFeedback, InterviewPrep } from '../types';
import { Button, Card, Input, Slider, Spinner, Logo, QAGeneratorIcon, KnowYourJobIcon, ResumeCheckerIcon, InterviewPrepIcon, LogoutIcon, DocumentTextIcon, ArrowUpTrayIcon, CheckCircleIcon, ChevronDownIcon, ClipboardIcon, FileUpload } from './ui';
import * as geminiService from '../services/geminiService';

// --- MODULE COMPONENTS (defined outside Dashboard to prevent re-renders) ---

interface ModuleProps {
    userType: UserType;
}

// --- Q&A Generator Refactored Component ---

type InputType = 'resume' | 'jd';

interface GeneratedAnswer {
    text: string;
    isLoading: boolean;
    error?: string;
}

const QAGenerator: React.FC<ModuleProps> = ({ userType }) => {
    const [inputType, setInputType] = useState<InputType>('resume');
    const [resumeFile, setResumeFile] = useState<{name: string, content: string} | null>(null);
    const [jdText, setJdText] = useState('');
    
    const [techQuestionsCount, setTechQuestionsCount] = useState(5);
    const [nonTechQuestionsCount, setNonTechQuestionsCount] = useState(5);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [generatedSkills, setGeneratedSkills] = useState<string[]>([]);
    const [technicalQuestions, setTechnicalQuestions] = useState<string[]>([]);
    const [nonTechnicalQuestions, setNonTechnicalQuestions] = useState<string[]>([]);
    const [answers, setAnswers] = useState<Record<string, GeneratedAnswer>>({});
    
    const inputText = useMemo(() => inputType === 'resume' ? resumeFile?.content : jdText, [inputType, resumeFile, jdText]);
    const isGenerateDisabled = isLoading || !inputText || (techQuestionsCount === 0 && nonTechQuestionsCount === 0);

    const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) {
           readFile(file);
        }
    };
    
    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
           readFile(file);
        }
    };

    const readFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setResumeFile({ name: file.name, content });
        };
        reader.readAsText(file);
        setError('');
    };

    const handleGenerateQuestions = async () => {
        if (!inputText) {
            setError('Please upload a resume or paste a job description.');
            return;
        }
        setIsLoading(true);
        setError('');
        setGeneratedSkills([]);
        setTechnicalQuestions([]);
        setNonTechnicalQuestions([]);
        setAnswers({});
        try {
            const data = await geminiService.generateQuestions(inputText, userType, techQuestionsCount, nonTechQuestionsCount);
            setGeneratedSkills(data.skills || []);
            setTechnicalQuestions(data.technicalQuestions || []);
            setNonTechnicalQuestions(data.nonTechnicalQuestions || []);
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred while generating questions.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateAnswer = async (question: string) => {
        if (!inputText) return;
        setAnswers(prev => ({ ...prev, [question]: { text: '', isLoading: true } }));
        try {
            const answerText = await geminiService.generateAnswer(question, inputText);
            setAnswers(prev => ({ ...prev, [question]: { text: answerText, isLoading: false } }));
        } catch (e: any) {
            setAnswers(prev => ({ ...prev, [question]: { text: '', isLoading: false, error: 'Failed to generate answer.' } }));
        }
    };

    const handleModifyAnswer = async (question: string, type: 'elaborate' | 'shorten') => {
        const currentAnswer = answers[question];
        if (!currentAnswer || !currentAnswer.text) return;

        setAnswers(prev => ({ ...prev, [question]: { ...prev[question], isLoading: true } }));
        try {
            const modifiedText = await geminiService.modifyAnswer(question, currentAnswer.text, type);
            setAnswers(prev => ({ ...prev, [question]: { text: modifiedText, isLoading: false } }));
        } catch (e: any) {
            setAnswers(prev => ({ ...prev, [question]: { ...prev[question], isLoading: false, error: `Failed to ${type} answer.` }}));
        }
    };
    
    const QuestionCard = ({ question }: { question: string }) => {
        const answer = answers[question];
        const [isCopied, setIsCopied] = useState(false);

        const handleCopy = () => {
          navigator.clipboard.writeText(question);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        };

        return (
            <Card className="fade-in !p-4">
                <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-slate-200">{question}</p>
                    <button onClick={handleCopy} title="Copy question" className="text-slate-400 hover:text-indigo-400 transition-colors shrink-0">
                      {isCopied ? <CheckCircleIcon className="h-5 w-5 text-green-400" /> : <ClipboardIcon className="h-5 w-5" />}
                    </button>
                </div>
                {!answer ? (
                    <Button onClick={() => handleGenerateAnswer(question)} className="!py-1.5 !px-3 text-sm mt-3">
                        💬 Generate Answer
                    </Button>
                ) : (
                    <div className="mt-3">
                        {answer.isLoading && <div className="text-sm text-slate-400 animate-pulse">Generating answer...</div>}
                        {answer.error && <p className="text-sm text-red-400">{answer.error}</p>}
                        {answer.text && (
                            <div className="fade-in space-y-3">
                                <p className="text-slate-300 whitespace-pre-wrap">{answer.text}</p>
                                <div className="flex gap-2">
                                    <button onClick={() => handleModifyAnswer(question, 'elaborate')} className="text-xs font-semibold bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-full transition-colors">
                                        🔍 Elaborate
                                    </button>
                                    <button onClick={() => handleModifyAnswer(question, 'shorten')} className="text-xs font-semibold bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-full transition-colors">
                                        ✂️ Shorten
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Card>
        );
    };

    const CollapsibleSection = ({ title, questions }: { title: string; questions: string[] }) => {
        if (questions.length === 0) return null;
        return (
            <details open className="group bg-slate-800/30 rounded-lg p-4 fade-in">
                <summary className="flex items-center justify-between font-semibold text-indigo-400 cursor-pointer list-none">
                    <h3 className="text-xl">{title}</h3>
                    <ChevronDownIcon className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 space-y-3">
                    {questions.map((q, i) => <QuestionCard key={i} question={q} />)}
                </div>
            </details>
        );
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-slate-100 mb-2">Q&A Generator</h2>
                <p className="text-slate-400">Generate tailored interview questions from a resume or job description.</p>
            </div>
            
            {/* Step 1: Input Type Selection */}
            <div className="space-y-3">
                <h3 className="font-semibold text-slate-300">Step 1: Choose your input type</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div onClick={() => setInputType('resume')} className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${inputType === 'resume' ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
                        <DocumentTextIcon className="h-8 w-8 text-indigo-400"/>
                        <div>
                            <h4 className="font-bold text-slate-100">From Resume</h4>
                            <p className="text-sm text-slate-400">Upload a file (PDF, DOC, TXT)</p>
                        </div>
                    </div>
                     <div onClick={() => setInputType('jd')} className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${inputType === 'jd' ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'}`}>
                        <ClipboardIcon className="h-8 w-8 text-indigo-400"/>
                        <div>
                            <h4 className="font-bold text-slate-100">From Job Description</h4>
                            <p className="text-sm text-slate-400">Paste text directly</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Step 2: Input Content */}
            <div className="space-y-3">
                 <h3 className="font-semibold text-slate-300">Step 2: Provide the content</h3>
                {inputType === 'resume' ? (
                     <div onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop} onClick={() => document.getElementById('resume-upload')?.click()} className="relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed border-slate-600 rounded-lg text-center cursor-pointer hover:border-indigo-500 transition-colors bg-slate-800/30">
                        <input type="file" id="resume-upload" className="hidden" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.txt" />
                        <ArrowUpTrayIcon className="h-10 w-10 text-slate-500 mb-3" />
                        {resumeFile ? (
                          <div className="flex items-center gap-2 text-green-400">
                             <CheckCircleIcon className="h-6 w-6" />
                             <span className="font-semibold">{resumeFile.name} uploaded</span>
                          </div>
                        ) : (
                          <>
                            <p className="font-semibold text-slate-300">Drag & drop your resume here</p>
                            <p className="text-slate-400">or click to browse</p>
                          </>
                        )}
                    </div>
                ) : (
                    <div className="relative">
                        <textarea
                            value={jdText}
                            onChange={(e) => setJdText(e.target.value)}
                            placeholder="Paste your job description here..."
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-4 h-48 resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-shadow"
                        />
                        <span className="absolute bottom-3 right-3 text-xs text-slate-500">{jdText.split(/\s+/).filter(Boolean).length} words</span>
                    </div>
                )}
            </div>

            {/* Step 3: Question Preferences */}
            <div className="space-y-3">
                 <h3 className="font-semibold text-slate-300">Step 3: Set your preferences</h3>
                 <Card className="!p-4">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Slider label="Technical Questions" min={0} max={15} value={techQuestionsCount} onChange={(e) => setTechQuestionsCount(parseInt(e.target.value))} />
                        <Slider label="Non-Technical Questions" min={0} max={10} value={nonTechQuestionsCount} onChange={(e) => setNonTechQuestionsCount(parseInt(e.target.value))} />
                    </div>
                 </Card>
            </div>
            
            {/* Step 4: Generate */}
            <div>
                 <Button onClick={handleGenerateQuestions} disabled={isGenerateDisabled} className="w-full !py-3 !text-lg !font-bold">
                    {isLoading ? 'Generating...' : '🎯 Generate Questions'}
                </Button>
            </div>
            
            {error && <p className="text-red-400 text-center">{error}</p>}
            {isLoading && <Spinner className="!h-24"/>}

            {/* Step 5 & 6: Display Results */}
            {(generatedSkills.length > 0 || technicalQuestions.length > 0 || nonTechnicalQuestions.length > 0) && (
                 <div className="space-y-6 pt-4 border-t border-slate-700/50">
                    {generatedSkills.length > 0 && (
                        <Card className="fade-in">
                            <h3 className="text-xl font-semibold mb-3 text-indigo-400">Extracted Key Skills</h3>
                            <div className="flex flex-wrap gap-2">
                                {generatedSkills.map(skill => <span key={skill} className="bg-slate-700 text-slate-200 text-sm font-medium px-3 py-1 rounded-full">{skill}</span>)}
                            </div>
                        </Card>
                    )}
                    <CollapsibleSection title="👨‍💻 Technical Questions" questions={technicalQuestions} />
                    <CollapsibleSection title="🗣️ Non-Technical Questions" questions={nonTechnicalQuestions} />
                 </div>
            )}
        </div>
    );
};

const KnowYourJob: React.FC<ModuleProps> = ({ userType }) => {
    const [activeTab, setActiveTab] = useState<'resume' | 'domain'>('resume');
    const [fileContent, setFileContent] = useState('');
    const [domain, setDomain] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState<JobSuggestion[] | null>(null);

    const handleFileSelected = useCallback((content: string, fileName: string) => {
        setFileContent(content);
        setError('');
    }, []);

    const handleGenerate = async () => {
        if (activeTab === 'resume' && !fileContent) {
            setError('Please upload a resume file.');
            return;
        }
        if (activeTab === 'domain' && !domain) {
            setError('Please enter a job domain.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResults(null);
        try {
            const data = activeTab === 'resume'
                ? await geminiService.findJobsFromResume(fileContent, userType)
                : await geminiService.findJobsInDomain(domain, userType);
            setResults(data);
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            <h2 className="text-3xl font-bold text-slate-100 mb-2">Know Your Job</h2>
            <p className="text-slate-400 mb-6">Discover job roles that match your profile or explore new domains.</p>
            <div className="flex border-b border-slate-700 mb-6">
                <button onClick={() => setActiveTab('resume')} className={`px-4 py-2 text-lg font-medium transition-colors ${activeTab === 'resume' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}>From Resume</button>
                <button onClick={() => setActiveTab('domain')} className={`px-4 py-2 text-lg font-medium transition-colors ${activeTab === 'domain' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400'}`}>By Domain</button>
            </div>
            <Card className="mb-6">
                {activeTab === 'resume' ? (
                    <FileUpload onFileSelect={handleFileSelected} />
                ) : (
                    <Input label="Enter a Job Domain" placeholder="e.g., Data Science, Cybersecurity" value={domain} onChange={e => setDomain(e.target.value)} />
                )}
                <Button onClick={handleGenerate} disabled={isLoading} className="w-full mt-4 !py-3">{isLoading ? 'Searching...' : 'Find Jobs'}</Button>
            </Card>
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            {isLoading && <Spinner />}
            {results && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {results.map((job) => (
                        <Card key={job.title}>
                            <h3 className="text-lg font-semibold text-indigo-400 mb-2">{job.title}</h3>
                            <p className="text-slate-300">{job.description}</p>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

const ResumeChecker: React.FC<ModuleProps> = ({ userType }) => {
    const [fileContent, setFileContent] = useState('');
    const [targetRole, setTargetRole] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<ResumeFeedback | null>(null);

    const handleFileSelected = useCallback((content: string, fileName: string) => {
        setFileContent(content);
        setError('');
    }, []);

    const handleCheck = async () => {
        if (!fileContent || !targetRole) {
            setError('Please upload a resume and specify a target role.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult(null);
        try {
            const data = await geminiService.checkResume(fileContent, userType, targetRole);
            setResult(data);
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            <h2 className="text-3xl font-bold text-slate-100 mb-2">Resume Checker & Enhancer</h2>
            <p className="text-slate-400 mb-6">Get AI-powered feedback and an enhanced version of your resume.</p>
            <Card className="mb-6 space-y-4">
                <FileUpload onFileSelect={handleFileSelected} />
                <Input label="Target Role" placeholder="e.g., Senior Frontend Developer" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
                <Button onClick={handleCheck} disabled={isLoading || !fileContent || !targetRole} className="w-full !py-3">{isLoading ? 'Analyzing...' : 'Check Resume'}</Button>
            </Card>
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            {isLoading && <Spinner />}
            {result && (
                <div className="space-y-6">
                    <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">ATS Score</h3>
                        <div className="flex items-center gap-4">
                            <div className="relative h-32 w-32">
                                <svg className="transform -rotate-90" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="54" fill="none" stroke="#334155" strokeWidth="12" />
                                    <circle cx="60" cy="60" r="54" fill="none" stroke="#818cf8" strokeWidth="12" strokeDasharray={2 * Math.PI * 54} strokeDashoffset={(2 * Math.PI * 54) * (1 - result.atsScore / 100)} />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold">{result.atsScore}</span>
                            </div>
                            <p className="text-slate-300">This score estimates your resume's compatibility with Applicant Tracking Systems. Higher is better!</p>
                        </div>
                    </Card>
                    <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">AI-Powered Feedback</h3>
                        <div className="space-y-3">
                            <div><strong className="text-slate-300">Clarity:</strong> {result.feedback.clarity}</div>
                            <div><strong className="text-slate-300">Structure:</strong> {result.feedback.structure}</div>
                            <div><strong className="text-slate-300">Grammar:</strong> {result.feedback.grammar}</div>
                            <div><strong className="text-slate-300">Role Fit:</strong> {result.feedback.roleFit}</div>
                        </div>
                    </Card>
                    <Card>
                        <div className="flex justify-between items-center mb-3">
                           <h3 className="text-xl font-semibold text-indigo-400">Enhanced Resume Snippet</h3>
                           <Button variant="secondary" onClick={() => navigator.clipboard.writeText(result.enhancedResume)}>Copy Text</Button>
                        </div>
                        <p className="text-slate-300 whitespace-pre-wrap bg-slate-900/50 p-4 rounded-md">{result.enhancedResume}</p>
                    </Card>
                </div>
            )}
        </div>
    );
};

const InterviewPreparator: React.FC<ModuleProps> = ({ userType }) => {
    const [company, setCompany] = useState('');
    const [role, setRole] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<InterviewPrep | null>(null);

    const handlePrepare = async () => {
        if (!company || !role) {
            setError('Please enter a company and role name.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult(null);
        try {
            const data = await geminiService.prepareForInterview(company, role, userType);
            setResult(data);
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div>
            <h2 className="text-3xl font-bold text-slate-100 mb-2">Interview Preparator</h2>
            <p className="text-slate-400 mb-6">Get company-specific insights, questions, and resources for your interview.</p>
            <Card className="mb-6">
                <div className="grid md:grid-cols-2 gap-4">
                    <Input label="Company Name" placeholder="e.g., Google" value={company} onChange={e => setCompany(e.target.value)} />
                    <Input label="Role Name" placeholder="e.g., Software Engineer" value={role} onChange={e => setRole(e.target.value)} />
                </div>
                <Button onClick={handlePrepare} disabled={isLoading || !company || !role} className="w-full mt-4 !py-3">{isLoading ? 'Preparing...' : 'Get Prep Guide'}</Button>
            </Card>
            {error && <p className="text-red-400 text-center mb-4">{error}</p>}
            {isLoading && <Spinner />}
            {result && (
                <div className="space-y-6">
                    <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">Company Insights for {company}</h3>
                        <p className="text-slate-300">{result.companyInsights}</p>
                    </Card>
                    <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">Key Skills for a {role}</h3>
                        <div className="flex flex-wrap gap-2">
                            {result.roleSpecificSkills.map(skill => <span key={skill} className="bg-slate-700 text-slate-200 text-sm font-medium px-3 py-1 rounded-full">{skill}</span>)}
                        </div>
                    </Card>
                     <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">Common Interview Questions</h3>
                        <ul className="list-disc list-inside space-y-2 text-slate-300">
                           {result.commonQuestions.map((q, i) => <li key={i}>{q}</li>)}
                        </ul>
                    </Card>
                    <Card>
                        <h3 className="text-xl font-semibold mb-3 text-indigo-400">Curated Prep Links</h3>
                        <div className="space-y-2">
                           {result.externalResources.map((res, i) => (
                               <a href={res.url} target="_blank" rel="noopener noreferrer" key={i} className="block text-indigo-400 hover:text-indigo-300 transition-colors">
                                  {res.title} ↗
                               </a>
                           ))}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};


// --- DASHBOARD COMPONENT ---

interface DashboardProps {
  userType: UserType;
  onLogout: () => void;
}

const navItems: { id: NavItemId; label: string; icon: React.FC<{className?: string}> }[] = [
    { id: 'qa-generator', label: 'Q&A Generator', icon: QAGeneratorIcon },
    { id: 'know-your-job', label: 'Know Your Job', icon: KnowYourJobIcon },
    { id: 'resume-checker', label: 'Resume Checker', icon: ResumeCheckerIcon },
    { id: 'interview-prep', label: 'Interview Prep', icon: InterviewPrepIcon },
];

const Dashboard: React.FC<DashboardProps> = ({ userType, onLogout }) => {
    const [activeModule, setActiveModule] = useState<NavItemId>('qa-generator');

    const renderModule = () => {
        const props = { userType };
        switch (activeModule) {
            case 'qa-generator': return <QAGenerator {...props} />;
            case 'know-your-job': return <KnowYourJob {...props} />;
            case 'resume-checker': return <ResumeChecker {...props} />;
            case 'interview-prep': return <InterviewPreparator {...props} />;
            default: return <QAGenerator {...props} />;
        }
    };
    
    return (
        <div className="flex h-screen bg-slate-900">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900/70 backdrop-blur-md border-r border-slate-800 flex flex-col p-4">
                <div className="flex items-center gap-3 mb-8">
                    <Logo className="h-10 w-10 text-indigo-400"/>
                    <h1 className="text-xl font-bold text-slate-100">InterviewVault</h1>
                </div>
                <nav className="flex-1 space-y-2">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveModule(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                                activeModule === item.id 
                                ? 'bg-indigo-600/30 text-indigo-300' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <item.icon className="h-6 w-6" />
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
                 <div className="mt-auto">
                    <div className="text-xs text-slate-500 mb-2 px-3">PROFILE</div>
                    <div className="text-center bg-slate-800 rounded-md p-3 mb-2">
                        <p className="text-sm font-semibold text-slate-200">{userType}</p>
                    </div>
                    <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-400 hover:bg-red-900/50 hover:text-red-300 transition-colors">
                        <LogoutIcon className="h-6 w-6"/>
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            
            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    {renderModule()}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;