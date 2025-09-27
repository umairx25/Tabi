from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
from workflow import run_agent  # your agent entry point

app = FastAPI()

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str
    context: dict | None = None  # Always send open tabs

@app.get("/")
@app.head("/")
def root():
    return {"status": "Tabi's backend is live!"}

@app.post("/agent")
def agent_route(req: PromptRequest):
    try:
        result = run_agent(req.prompt + str(req.context["tabs"]))
        return JSONResponse(content={
            "output": result["output"],
            "action": result["action"]
        })
    except Exception as e:
        print("Agent error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
