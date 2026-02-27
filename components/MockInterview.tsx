import React, { useState, useEffect, useRef } from 'react';
import { UserType, InterviewMessage } from '../types';
import { Button, Card, FileUpload, Input, Spinner } from './ui';
import { interviewApi, SetupOptions, InterviewSession } from '../services/api';
import { Volume2Icon, VolumeXIcon, MicIcon, MicOffIcon } from 'lucide-react';

// Add TypeScript support for Web Speech API
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}
interface MockInterviewProps {
    userType: UserType;
}

const MockInterview: React.FC<MockInterviewProps> = ({ userType }) => {
    // Session State
    const [session, setSession] = useState<InterviewSession | null>(null);
    const [isStarted, setIsStarted] = useState(false);

    // Setup State
    const [mode, setMode] = useState<'resume_role' | 'domain_topic'>('resume_role');
    const [difficulty, setDifficulty] = useState<'standard' | 'challenging' | 'expert'>('standard');
    const [targetRole, setTargetRole] = useState('');
    const [domain, setDomain] = useState('');
    const [topic, setTopic] = useState('');
    const [resumeFile, setResumeFile] = useState<File | null>(null);

    // Active Interview State
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // Refs
    const recognitionRef = useRef<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isStarted) scrollToBottom();
    }, [session?.questions, isLoading]);

    // Handle TTS Cleanup
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    const toggleRecording = () => {
        if (isRecording) {
            if (recognitionRef.current) recognitionRef.current.stop();
            setIsRecording(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError("Your browser does not support Voice Recognition.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            let currentTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                currentTranscript += event.results[i][0].transcript;
            }

            // Append to existing input, but handle interim overwrites elegantly
            // For a simpler approach, we just append finalized results or overwrite the whole thing based on a snapshot
            // An easier way is just accumulating currentTranscript to what existed before tracking started
            // Since continuous=true interimResults=true can be tricky, let's keep it simple: Replace input with the transcript of this session
            // A more robust way:
            let finalTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
                finalTranscript += event.results[i][0].transcript;
            }
            setUserInput(finalTranscript);
        };

        recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            setIsRecording(false);
        };

        recognition.onend = () => {
            setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
    };

    const handleFileSelect = (content: string, fileName: string, file?: File) => {
        if (file) setResumeFile(file);
        setError('');
    };

    const toggleSpeech = (text: string) => {
        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    };

    const handleStartInterview = async () => {
        if (mode === 'resume_role' && (!resumeFile || !targetRole)) {
            setError('Please upload a resume and specify a target role.');
            return;
        }
        if (mode === 'domain_topic' && (!domain || !topic)) {
            setError('Please enter both a domain and a topic.');
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const options: SetupOptions = { mode, difficulty, targetRole, domain, topic, file: resumeFile || undefined };
            const initData = await interviewApi.initInterview(options);

            // Reconstruct a local session object to manage state before refetching from DB
            setSession({
                _id: initData.sessionId,
                mode,
                difficulty,
                status: 'in_progress',
                createdAt: new Date().toISOString(),
                overallScore: 0,
                context: {},
                questions: [{
                    questionNumber: initData.questionNumber,
                    questionText: initData.questionText
                }]
            });
            setIsStarted(true);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Failed to start interview. Is the backend running?');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!userInput.trim() || isLoading || !session) return;

        setIsLoading(true);
        const currentAnswer = userInput;
        setUserInput('');

        // Optimistically update UI with user's answer
        const updatedQuestions = [...session.questions];
        updatedQuestions[updatedQuestions.length - 1].userAnswer = currentAnswer;
        setSession({ ...session, questions: updatedQuestions });

        try {
            const result = await interviewApi.submitAnswer(session._id, currentAnswer);

            const newQuestions = [...updatedQuestions];
            newQuestions[newQuestions.length - 1].evaluation = result.evaluation;

            if (result.nextQuestion) {
                newQuestions.push({
                    questionNumber: result.nextQuestion.number,
                    questionText: result.nextQuestion.text
                });
            }

            setSession({
                ...session,
                questions: newQuestions,
                status: result.isCompleted ? 'completed' : 'in_progress'
            });

        } catch (e: any) {
            setError('Failed to submit answer.');
            // Revert optimistic update on failure
            updatedQuestions[updatedQuestions.length - 1].userAnswer = undefined;
            setSession({ ...session, questions: updatedQuestions });
            setUserInput(currentAnswer);
        } finally {
            setIsLoading(false);
        }
    };

    const handleEndInterview = async () => {
        if (!session) return;
        setIsLoading(true);
        try {
            const report = await interviewApi.getReport(session._id);
            setSession(report);
            setIsStarted(false);
        } catch (e) {
            setError('Failed to fetch final report.');
        } finally {
            setIsLoading(false);
        }
    };

    // --- RENDER SETUP ---
    if (!isStarted && (!session || session.status !== 'completed')) {
        return (
            <div className="space-y-6 max-w-2xl mx-auto fade-in">
                <div>
                    <h2 className="text-3xl font-bold text-slate-100 mb-2">Configure Mock Interview</h2>
                    <p className="text-slate-400">Tailor the AI simulator to your specific prep needs.</p>
                </div>

                <Card className="space-y-6">
                    {/* Mode Selection */}
                    <div>
                        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">1. Interview Mode</h3>
                        <div className="flex rounded-md border border-slate-700 bg-slate-900/50 p-1">
                            <button
                                onClick={() => setMode('resume_role')}
                                className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${mode === 'resume_role' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Resume + Target Role
                            </button>
                            <button
                                onClick={() => setMode('domain_topic')}
                                className={`flex-1 py-2 text-sm font-medium rounded transition-colors ${mode === 'domain_topic' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Domain + Topic
                            </button>
                        </div>
                    </div>

                    {/* Difficulty Selection */}
                    <div>
                        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">2. Difficulty Level</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {['standard', 'challenging', 'expert'].map((d) => (
                                <button
                                    key={d}
                                    onClick={() => setDifficulty(d as any)}
                                    className={`py-3 px-2 text-sm font-semibold rounded-md border capitalize transition-all ${difficulty === d
                                        ? 'bg-slate-800 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20'
                                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-500'
                                        }`}
                                >
                                    {d === 'standard' ? '🟢 ' : d === 'challenging' ? '🟡 ' : '🔴 '} {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Context Inputs */}
                    <div className="space-y-4 pt-4 border-t border-slate-700">
                        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">3. Provide Context</h3>
                        {mode === 'resume_role' ? (
                            <>
                                <Input label="Target Job Role" placeholder="e.g., Software Engineer, Product Manager" value={targetRole} onChange={e => setTargetRole(e.target.value)} />
                                <div className="pt-2">
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Upload Resume</label>
                                    <FileUpload onFileSelect={(c, n, f) => handleFileSelect(c, n, f)} acceptedFileTypes=".pdf,.docx,.txt" />
                                </div>
                            </>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-4">
                                <Input label="Domain" placeholder="e.g., Data Structures" value={domain} onChange={e => setDomain(e.target.value)} />
                                <Input label="Specific Topic" placeholder="e.g., Binary Trees" value={topic} onChange={e => setTopic(e.target.value)} />
                            </div>
                        )}
                    </div>

                    <Button onClick={handleStartInterview} disabled={isLoading} className="w-full !py-3 !mt-6">
                        {isLoading ? <Spinner className="!h-5 !w-5 inline mr-2 text-white" /> : '🚀 Start Simulator'}
                    </Button>
                    {error && <p className="text-red-400 text-center text-sm font-medium bg-red-900/20 p-2 rounded">{error}</p>}
                </Card>
            </div>
        );
    }

    // --- RENDER ACTVE INTERVIEW ---
    if (isStarted && session) {
        return (
            <div className="flex flex-col h-[calc(100vh-120px)] fade-in">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-100">Live Interview</h2>
                        <p className="text-sm text-slate-400">Question {session.questions.length} • {difficulty} Mode</p>
                    </div>
                    <Button variant="secondary" onClick={handleEndInterview} className="text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-900/50">
                        End Interview
                    </Button>
                </div>

                <Card className="flex-1 flex flex-col !p-0 overflow-hidden bg-slate-900 shadow-xl border-slate-700">
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-700">
                        {session.questions.map((q, idx) => (
                            <div key={idx} className="space-y-6">
                                {/* Interviewer Question Bubble */}
                                <div className="flex justify-start">
                                    <div className="max-w-[85%] bg-slate-800 border border-slate-700 p-5 rounded-2xl rounded-tl-none shadow-md">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">AI Interviewer</span>
                                            <button onClick={() => toggleSpeech(q.questionText)} className="text-slate-400 hover:text-indigo-400 transition-colors">
                                                {isSpeaking ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
                                            </button>
                                        </div>
                                        <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{q.questionText}</p>
                                    </div>
                                </div>

                                {/* User Answer Bubble */}
                                {q.userAnswer && (
                                    <div className="flex justify-end">
                                        <div className="max-w-[85%] bg-indigo-600 p-5 rounded-2xl rounded-tr-none shadow-md text-white">
                                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-200 block mb-2">You</span>
                                            <p className="whitespace-pre-wrap leading-relaxed">{q.userAnswer}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Instant Feedback Removed: Feedback is now only shown in the final Performance Report */}
                            </div>
                        ))}

                        {isLoading && !session.questions[session.questions.length - 1].userAnswer && (
                            <div className="flex justify-start pt-4">
                                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 rounded-tl-none">
                                    <Spinner className="!h-6 !w-6" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {session.status === 'in_progress' ? (
                        <div className="p-4 bg-slate-800 border-t border-slate-700">
                            {error && <p className="text-red-400 text-xs mb-2 text-center">{error}</p>}
                            <div className="flex gap-3 relative">
                                <textarea
                                    value={userInput}
                                    onChange={(e) => setUserInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder={isRecording ? "Listening... Speak now." : "Type your answer here or press the mic to speak..."}
                                    className={`flex-1 bg-slate-900 border ${isRecording ? 'border-red-500 shadow-red-500/20 shadow-inner' : 'border-slate-600 shadow-inner'} rounded-lg py-3 pl-3 pr-14 text-slate-200 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors`}
                                />
                                <button
                                    onClick={toggleRecording}
                                    className={`absolute right-24 top-1/2 -translate-y-1/2 p-3 rounded-full transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                    title={isRecording ? "Stop Recording" : "Start Recording"}
                                >
                                    {isRecording ? <MicOffIcon size={20} /> : <MicIcon size={20} />}
                                </button>
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={isLoading || (!userInput.trim() && !isRecording)}
                                    className="h-24 px-8 shrink-0 font-bold text-lg shadow-lg"
                                >
                                    {isLoading ? '...' : 'Send'}
                                </Button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 text-right">
                                Press Enter to send. Shift + Enter for new line.
                            </p>
                        </div>
                    ) : (
                        <div className="p-6 bg-slate-800 border-t border-slate-700 text-center">
                            <p className="text-slate-300 mb-4">Interview Session Completed</p>
                            <Button onClick={handleEndInterview}>View Performance Report</Button>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    // --- RENDER PERFORMANCE REPORT ---
    if (session && session.status === 'completed') {
        // Determine Badge
        const score = session.overallScore;
        let badge = { text: 'Needs Improvement', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
        if (score >= 8.5) badge = { text: 'Excellent', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' };
        else if (score >= 7.0) badge = { text: 'Good', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
        else if (score >= 5.0) badge = { text: 'Fair', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };

        return (
            <div className="space-y-8 max-w-4xl mx-auto fade-in pb-12">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-100">Performance Report</h2>
                        <p className="text-slate-400">{new Date(session.createdAt).toLocaleDateString()} • {session.mode.replace('_', ' ')} • {session.difficulty}</p>
                    </div>
                    <Button onClick={() => { setSession(null); setIsStarted(false); }}>Start New Interview</Button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="flex flex-col items-center justify-center p-8">
                        <h3 className="text-lg font-medium text-slate-400 mb-2">Overall Score</h3>
                        <div className="text-6xl font-bold text-indigo-400 mb-4">{session.overallScore.toFixed(1)}<span className="text-2xl text-slate-500">/10</span></div>
                        <div className={`px-4 py-1.5 rounded-full border font-bold ${badge.bg} ${badge.color}`}>
                            {badge.text}
                        </div>
                    </Card>

                    <Card className="flex flex-col justify-center">
                        <h3 className="font-semibold text-slate-300 mb-4 border-b border-slate-700 pb-2">Session Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-400">Total Questions:</span> <span className="font-medium text-slate-200">{session.questions.length}</span></div>
                            {session.context.targetRole && <div className="flex justify-between"><span className="text-slate-400">Target Role:</span> <span className="font-medium text-slate-200">{session.context.targetRole}</span></div>}
                            {session.context.domain && <div className="flex justify-between"><span className="text-slate-400">Domain:</span> <span className="font-medium text-slate-200">{session.context.domain}</span></div>}
                            {session.context.topic && <div className="flex justify-between"><span className="text-slate-400">Topic:</span> <span className="font-medium text-slate-200">{session.context.topic}</span></div>}
                        </div>
                    </Card>
                </div>

                <Card>
                    <h3 className="text-xl font-bold text-slate-100 mb-6 border-b border-slate-700 pb-4">Question Review</h3>
                    <div className="space-y-6">
                        {session.questions.map((q, idx) => (
                            <details key={idx} className="group bg-slate-800/30 border border-slate-700 rounded-lg p-0 overflow-hidden">
                                <summary className="flex items-center justify-between p-4 cursor-pointer list-none bg-slate-800/80 hover:bg-slate-700/80 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`flex w-8 h-8 rounded-full items-center justify-center font-bold text-sm ${q.evaluation?.score && q.evaluation.score >= 7 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                            {q.questionNumber}
                                        </div>
                                        <h4 className="font-medium text-slate-200 line-clamp-1 flex-1">{q.questionText}</h4>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold text-indigo-400">{q.evaluation?.score}/10</span>
                                        <span className="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                                    </div>
                                </summary>
                                <div className="p-4 border-t border-slate-700 space-y-4">
                                    <div>
                                        <strong className="text-xs text-slate-500 uppercase tracking-wider block mb-1">Your Answer</strong>
                                        <p className="text-slate-300 bg-slate-900/50 p-3 rounded">{q.userAnswer || "No answer provided."}</p>
                                    </div>
                                    {q.evaluation && (
                                        <>
                                            <div>
                                                <strong className="text-xs text-indigo-400 uppercase tracking-wider block mb-1">AI Feedback</strong>
                                                <p className="text-slate-300 italic">{q.evaluation.feedback}</p>
                                            </div>
                                            <div className="grid md:grid-cols-2 gap-4 text-sm mt-2">
                                                <div>
                                                    <strong className="text-green-400">Strengths</strong>
                                                    <ul className="text-slate-400 list-inside list-disc">
                                                        {q.evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                                    </ul>
                                                </div>
                                                <div>
                                                    <strong className="text-red-400">Improvements</strong>
                                                    <ul className="text-slate-400 list-inside list-disc">
                                                        {q.evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
                                                    </ul>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </details>
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    return null;
};

export default MockInterview;
