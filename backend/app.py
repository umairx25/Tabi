"""
API layer that receives browser data from the extension and returns appropriate
information to the extension
"""
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from main import run_agent 
import uvicorn
from dotenv import load_dotenv
import os
import httpx
from datetime import datetime

dotenv = load_dotenv()
REMOVE_BG_API_KEY = os.getenv("REMOVE_BG_API_KEY")
RATE_LIMIT = 50
IP_RATE_LIMIT = 25
GLOBAL_RATE_LIMIT = 400
WINDOW = 3600
MAX_REMOVE_BG_BYTES = 12 * 1024 * 1024
rate_limit_store = {}

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


@app.middleware("http")
async def rate_limit(req: Request, call_next):
    if req.url.path != "/agent" or req.method == "OPTIONS":
        return await call_next(req)

    try:
        body = await req.json()
        client_id = body.get("context", {}).get("client_id")
        client_ip = str(req.client.host)
    except Exception:
        client_id = None
        client_ip = "unknown"

    if not client_id:
        return JSONResponse(status_code=400, content={"error": "Missing client ID"})
    
    global_key = "rate_limit:global"
    key = f"rate_limit:{client_id}"
    ip_key = f"rate_limit:{client_ip}"
    curr_time = datetime.now().timestamp()

    for stored_key, entry in list(rate_limit_store.items()):
        if curr_time - entry["timestamp"] >= WINDOW:
            del rate_limit_store[stored_key]

    def check_limit(given_key, limit):
        entry = rate_limit_store.get(given_key)

        if not entry or curr_time - entry["timestamp"] >= WINDOW:
            rate_limit_store[given_key] = {
                "timestamp": curr_time,
                "count": 1,
            }
            return None

        if entry["count"] + 1 > limit:
            retry_after = max(1, int(WINDOW - (curr_time - entry["timestamp"])))
            return JSONResponse(
                status_code=429,
                content={"error": "Rate limit exceeded. Please try again later."},
                headers={"Retry-After": str(retry_after)},
            )

        entry["count"] += 1
        return None

    for limited_key, limit in (
        (key, RATE_LIMIT),
        (ip_key, IP_RATE_LIMIT),
        (global_key, GLOBAL_RATE_LIMIT),
    ):
        limited_response = check_limit(limited_key, limit)
        if limited_response:
            return limited_response

    response = await call_next(req)
    return response


@app.get("/")
@app.head("/")
def root():
    return {"status": "Tabi's backend is live!"}

@app.post("/agent")
async def agent_route(req: PromptRequest):
    try:
        result = await run_agent(req.prompt, (req.context["tabs"]))
        return JSONResponse(content={
            "output": result["output"],
            "action": result["action"]
        })
    except Exception as e:
        # print("Agent error:", e)
        return JSONResponse(status_code=500, content={"Error encountered"})


@app.post("/remove-background")
async def remove_background(image: UploadFile = File(...)):
    if not REMOVE_BG_API_KEY:
        return JSONResponse(status_code=500, content={"error": "Remove.bg API key is not configured"})

    if not image.content_type or not image.content_type.startswith("image/"):
        return JSONResponse(status_code=400, content={"error": "Upload an image file"})

    image_bytes = await image.read()
    if not image_bytes:
        return JSONResponse(status_code=400, content={"error": "Image file is empty"})

    if len(image_bytes) > MAX_REMOVE_BG_BYTES:
        return JSONResponse(status_code=413, content={"error": "Image must be 12MB or smaller"})

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.remove.bg/v1.0/removebg",
                headers={"X-Api-Key": REMOVE_BG_API_KEY},
                data={"size": "auto"},
                files={
                    "image_file": (
                        image.filename or "image",
                        image_bytes,
                        image.content_type,
                    )
                },
            )
    except httpx.HTTPError:
        return JSONResponse(status_code=502, content={"error": "Background removal service is unavailable"})

    if response.status_code >= 400:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text
        return JSONResponse(status_code=response.status_code, content={"error": detail})

    return Response(
        content=response.content,
        media_type=response.headers.get("content-type", "image/png"),
        headers={"Content-Disposition": 'attachment; filename="tabi-no-bg.png"'},
    )


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8001, reload=True)
