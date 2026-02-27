import os
import uuid
import random
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict
from google import genai
from google.genai import types
from dotenv import load_dotenv

import PyPDF2
import docx

# Load environment variables
load_dotenv()

# Check for API Key
GEMINI_API_KEY = os.getenv("VITE_GEMINI_API_KEY") or os.getenv("API_KEY")
if not GEMINI_API_KEY:
    print("WARNING: Gemini API Key not found in environment variables.")

# Initialize Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI(title="InterviewVault Backend API")

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mock Database Connection (In-Memory) ---
class MockCollection:
    def __init__(self):
        self.data = {}
    
    async def insert_one(self, doc):
        self.data[doc["_id"]] = doc
        
    async def find_one(self, q):
        return self.data.get(q.get("_id"))
        
    async def update_one(self, q, update):
        if "_id" in q and q["_id"] in self.data:
            doc = self.data[q["_id"]]
            if "$set" in update:
                for k, v in update["$set"].items():
                    doc[k] = v
                
    def find(self, q):
        class Cursor:
            def __init__(self, data):
                self._data = list(data.values())
            def sort(self, key, direction):
                self._data.sort(key=lambda x: x.get(key, ""), reverse=(direction == -1))
                return self
            def limit(self, num):
                self._data = self._data[:num]
                return self
            async def to_list(self, length):
                return self._data[:length]
        return Cursor(self.data)

sessions_collection = MockCollection()
print("Using in-memory Mock DB for testing.")


# --- Pydantic Models ---
class InterviewSetupRequest(BaseModel):
    mode: str # 'resume_role' or 'domain_topic'
    difficulty: str # 'standard', 'challenging', 'expert'
    targetRole: Optional[str] = None
    domain: Optional[str] = None
    topic: Optional[str] = None
    resumeText: Optional[str] = None

class AnswerRequest(BaseModel):
    answer: str

# --- Helper Functions ---
def extract_text_from_file(file: UploadFile) -> str:
    text = ""
    try:
        content = file.file.read()
        if file.filename.endswith(".pdf"):
            import io
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text += page.extract_text() + "\\n"
        elif file.filename.endswith(".docx"):
            import io
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\\n"
        elif file.filename.endswith(".txt"):
             text = content.decode('utf-8')
        else:
             raise Exception("Unsupported file format")       
    except Exception as e:
        print(f"Error extracting text: {e}")
    return text

def get_difficulty_context(difficulty: str) -> str:
    if difficulty == 'standard':
        return "Focus on core concepts, fundamental questions, and expected campus-level knowledge."
    elif difficulty == 'challenging':
        return "Focus on optimization, edge cases, trade-offs, and real-world scenarios. Ask probing follow-ups."
    elif difficulty == 'expert':
        return "Focus on architecture, system design, scalability under load, and complex problem-solving. Assume the candidate is highly experienced."
    return ""


# --- Routes ---

@app.post("/api/interview/init")
async def init_interview(
    mode: str = Form(...),
    difficulty: str = Form(...),
    targetRole: str = Form(None),
    domain: str = Form(None),
    topic: str = Form(None),
    file: UploadFile = File(None)
):
    if sessions_collection is None:
        raise HTTPException(status_code=500, detail="Database connection not available")

    # 1. Parse Context gathering
    resume_text = ""
    if mode == "resume_role" and file:
        resume_text = extract_text_from_file(file)
        if not resume_text:
             raise HTTPException(status_code=400, detail="Could not extract text from the provided file.")
             
    context_details = {
        "mode": mode,
        "difficulty": difficulty,
        "targetRole": targetRole,
        "domain": domain,
        "topic": topic,
        "resumeText": resume_text[:5000] if resume_text else None, # Limit length
        "maxQuestions": random.randint(14, 18)
    }

    # 2. Build Initial Prompt for Gemini
    diff_context = get_difficulty_context(difficulty)
    if mode == 'resume_role':
         prompt = f"""
         You are a strict but fair technical interviewer. We are starting a mock interview for a '{targetRole}' position.
         Difficulty level: {difficulty}. {diff_context}
         
         Here is the candidate's extracted resume:
         ---
         {resume_text}
         ---
         
         Based specifically on their specific projects, implementation choices, and technologies listed in the resume, generate the FIRST interview question.
         Introduce yourself very briefly (1 sentence) and ask the question.
         """
    else:
         prompt = f"""
         You are a strict but fair technical interviewer. We are starting a mock interview focused on the domain '{domain}' and specifically the topic '{topic}'.
         Difficulty level: {difficulty}. {diff_context}
         
         Generate the FIRST conceptual or technical interview question regarding this topic.
         Introduce yourself very briefly (1 sentence) and ask the question.
         """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        first_question = response.text
    except Exception as e:
         print(f"Gemini API Error: {e}")
         raise HTTPException(status_code=500, detail="Failed to communicate with AI service.")

    # 3. Create Session in DB
    session_id = str(uuid.uuid4())
    new_session = {
        "_id": session_id,
        "userId": "anonymous_user", # Placeholder until real auth is added
        "context": context_details,
        "questions": [
             {
                 "questionNumber": 1,
                 "questionText": first_question,
                 "userAnswer": None,
                 "evaluation": None
             }
        ],
        "status": "in_progress",
        "createdAt": datetime.utcnow()
    }
    
    await sessions_collection.insert_one(new_session)

    return {
        "sessionId": session_id,
        "questionNumber": 1,
        "questionText": first_question
    }


@app.post("/api/interview/{session_id}/answer")
async def evaluate_answer(session_id: str, request: AnswerRequest):
    if sessions_collection is None:
        raise HTTPException(status_code=500, detail="Database connection not available")

    # 1. Retrieve Session
    session = await sessions_collection.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed.")

    questions = session.get("questions", [])
    current_q_index = len(questions) - 1
    current_question = questions[current_q_index]
    
    # 2. Build Evaluation Prompt
    context = session.get("context", {})
    diff_context = get_difficulty_context(context.get("difficulty"))
    max_questions = context.get("maxQuestions", 15)
    is_last_question = len(questions) >= max_questions

    # Reconstruct history for context
    history_str = ""
    for idx, q in enumerate(questions):
         history_str += f"Interviewer (Q{idx+1}): {q.get('questionText')}\\n"
         if q.get('userAnswer'):
             history_str += f"Candidate (A{idx+1}): {q.get('userAnswer')}\\n"
             
    history_str += f"Candidate (A{current_q_index+1}): {request.answer}\\n"

    prompt = f"""
    You are a strict but fair technical interviewer.
    Context Mode: {context.get('mode')}. Difficulty: {context.get('difficulty')}. {diff_context}
    
    Conversation History:
    {history_str}
    
    Please evaluate the candidate's latest answer to Question {current_q_index+1}.
    
    Tasks:
    1. Score the answer strictly from 0.0 to 10.0.
    2. Provide a 2-3 sentence feedback summary.
    3. List 2-3 specific strengths in the answer.
    4. List 2-3 specific areas for improvement.
    """
    
    if not is_last_question:
         prompt += "\\n5. Generate a short conversational transition (e.g., 'Good point.', 'I see what you mean.') acknowledging their answer, and then provide the NEXT relevant interview question based on the conversation flow."
    else:
         prompt += "\\n5. Generate a short conversational sign-off thanking them for their time. Do NOT generate a next question. This is the final question."

    prompt += """
    Return a strict JSON object exactly matching this schema:
    {
      "score": 8.5,
      "feedback": "string",
      "strengths": ["string", "string"],
      "improvements": ["string", "string"],
      "transitionSnippet": "string",
      "nextQuestion": "string or null if final"
    }
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
             config=types.GenerateContentConfig(
                response_mime_type="application/json",
             )
        )
        # Process JSON (we assume Gemini returns it correctly based on mime config)
        import json
        evaluation_result = json.loads(response.text)
    except Exception as e:
         print(f"Gemini API Error during evaluation: {e}")
         raise HTTPException(status_code=500, detail="Failed to evaluate answer with AI service.")

    # 3. Update Current Question in DB
    questions[current_q_index]["userAnswer"] = request.answer
    questions[current_q_index]["evaluation"] = {
        "score": evaluation_result.get("score"),
        "feedback": evaluation_result.get("feedback"),
        "strengths": evaluation_result.get("strengths", []),
        "improvements": evaluation_result.get("improvements", [])
    }
    
    updates = {
        "questions": questions
    }
    
    response_data = {
         "evaluation": questions[current_q_index]["evaluation"],
         "isCompleted": is_last_question,
         "nextQuestion": None
    }

    # 4. Handle Next Question or Completion
    if not is_last_question and evaluation_result.get("nextQuestion"):
         next_q_num = current_q_index + 2
         raw_next = evaluation_result.get("nextQuestion")
         transition = evaluation_result.get("transitionSnippet", "")
         combined_text = f"{transition} {raw_next}".strip()

         questions.append({
             "questionNumber": next_q_num,
             "questionText": combined_text,
             "userAnswer": None,
             "evaluation": None
         })
         updates["questions"] = questions
         response_data["nextQuestion"] = {
              "number": next_q_num,
              "text": combined_text
         }
    elif is_last_question:
         updates["status"] = "completed"
         updates["completedAt"] = datetime.utcnow()
         # Calculate overall score
         scores = [q.get("evaluation", {}).get("score", 0) for q in questions if q.get("evaluation")]
         updates["overallScore"] = sum(scores) / len(scores) if scores else 0

    # Apply updates to DB
    await sessions_collection.update_one({"_id": session_id}, {"$set": updates})

    return response_data


@app.get("/api/interview/{session_id}/report")
async def get_interview_report(session_id: str):
    if sessions_collection is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
        
    session = await sessions_collection.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return session

@app.get("/api/interview/history")
async def get_interview_history():
     if sessions_collection is None:
        raise HTTPException(status_code=500, detail="Database connection not available")
     
     # Sort by newest first
     cursor = sessions_collection.find({"userId": "anonymous_user"}).sort("createdAt", -1).limit(50)
     history = await cursor.to_list(length=50)
     return history

# Run: uvicorn main:app --reload
