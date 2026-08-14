from fastapi import FastAPI
import os

app = FastAPI(
    title="recommendation Service",
    description="EHR Platform - STUB Implementation",
    version="0.1.0"
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "recommendation"}
