"""
Ballot Validation Service — FastAPI Application

Validates Gov.gr Solemn Declaration PDFs as certified ballots.
Implements 4 security gates:
1. Integrity (Anti-Forgery): Verify PAdES digital signature
2. Uniqueness (Anti-Spam): Check file hash for duplicates
3. Context (Session Security): Verify poll token in text
4. Identity (One Person, One Vote): Hash AFM and check voter uniqueness
"""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from database import get_db, init_db, engine
from models import Vote
from validator import BallotValidator, ValidationResult, RejectionReason

# ─── Logging ────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("ballot_service")

# ─── Pydantic Models ────────────────────────────────────────────────────────

class VoteResponse(BaseModel):
    success: bool
    message: str
    voter_hash: Optional[str] = None
    vote_choice: Optional[str] = None
    file_hash: Optional[str] = None
    signer_name: Optional[str] = None
    rejection_reason: Optional[str] = None


class IdentityResponse(BaseModel):
    success: bool
    message: str
    voter_hash: Optional[str] = None
    signer_name: Optional[str] = None
    rejection_reason: Optional[str] = None
    demographics: Optional[dict] = None
    doc_code_hash: Optional[str] = None


class PollStats(BaseModel):
    poll_id: str
    total_votes: int
    unique_voters: int
    choices: dict[str, int]


class HealthResponse(BaseModel):
    status: str
    database: str
    service: str


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Ballot Validation Service starting up...")
    init_db()
    logger.info("Database initialized")
    yield
    logger.info("Ballot Validation Service shutting down")


# ─── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ballot Validation Service",
    description="Validates Gov.gr Solemn Declaration PDFs as certified ballots with 4 security gates",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow main API to proxy requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to main API origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helper ─────────────────────────────────────────────────────────────────

def result_to_response(result: ValidationResult) -> tuple[VoteResponse, int]:
    """Convert ValidationResult to API response."""
    status_code = 200 if result.success else 400
    return (
        VoteResponse(
            success=result.success,
            message=result.message,
            voter_hash=result.voter_hash,
            vote_choice=result.vote_choice,
            file_hash=result.file_hash,
            signer_name=result.signer_name,
            rejection_reason=result.rejection_reason.value if result.rejection_reason else None,
        ),
        status_code,
    )


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return HealthResponse(status="healthy", database="connected", service="ballot_validation")
    except Exception as e:
        return HealthResponse(
            status="unhealthy",
            database=f"error: {str(e)}",
            service="ballot_validation",
        )


@app.post("/api/ballot/validate", response_model=VoteResponse)
async def validate_ballot(
    file: UploadFile = File(..., description="Gov.gr Solemn Declaration PDF"),
    poll_id: str = Form(..., description="Poll identifier"),
    poll_token: str = Form(..., description="Session token for this poll"),
    db: Session = Depends(get_db),
):
    """
    Validate a ballot PDF and record the vote.
    
    Runs 4 security gates:
    1. PAdES signature verification
    2. File uniqueness check
    3. Poll token verification
    4. Voter identity (one person, one vote)
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    
    logger.info(f"Validating ballot for poll={poll_id}, file={file.filename}, size={len(pdf_bytes)} bytes")
    
    validator = BallotValidator(db)
    
    try:
        result = await validator.validate(pdf_bytes, poll_id, poll_token)
    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal validation error: {str(e)}")
    
    response, status_code = result_to_response(result)
    logger.info(f"Validation result: success={result.success}, reason={result.rejection_reason}")
    
    return response, status_code


@app.post("/api/ballot/validate-identity", response_model=IdentityResponse)
async def validate_identity(
    file: UploadFile = File(..., description="Gov.gr Solemn Declaration PDF"),
    db: Session = Depends(get_db),
):
    """
    Validate identity only (one-time verification).
    
    Checks:
    - Valid government PAdES signature
    - Extracts AFM and returns voter hash
    
    Does NOT check poll token or vote choice.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    
    try:
        pdf_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")
    
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    
    logger.info(f"Validating identity for file={file.filename}")
    
    validator = BallotValidator(db)
    
    try:
        result = await validator.validate_identity(pdf_bytes)
    except Exception as e:
        logger.error(f"Identity validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal validation error: {str(e)}")
    
    status_code = 200 if result.success else 400
    return (
        IdentityResponse(
            success=result.success,
            message=result.message,
            voter_hash=result.voter_hash,
            signer_name=result.signer_name,
            rejection_reason=result.rejection_reason.value if result.rejection_reason else None,
            demographics=result.demographics,
            doc_code_hash=result.doc_code_hash,
        ),
        status_code,
    )


@app.get("/api/ballot/poll/{poll_id}/stats", response_model=PollStats)
async def get_poll_stats(poll_id: str, db: Session = Depends(get_db)):
    """Get voting statistics for a poll."""
    from sqlalchemy import func
    from sqlalchemy.orm import Session
    
    votes = db.query(Vote).filter(Vote.poll_id == poll_id).all()
    
    if not votes:
        return PollStats(
            poll_id=poll_id,
            total_votes=0,
            unique_voters=0,
            choices={},
        )
    
    # Count votes per choice
    choices: dict[str, int] = {}
    for vote in votes:
        choices[vote.vote_choice] = choices.get(vote.vote_choice, 0) + 1
    
    # Unique voters
    unique_voters = len(set(v.voter_hash for v in votes))
    
    return PollStats(
        poll_id=poll_id,
        total_votes=len(votes),
        unique_voters=unique_voters,
        choices=choices,
    )


@app.get("/api/ballot/poll/{poll_id}/votes")
async def get_poll_votes(
    poll_id: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Get votes for a poll (admin endpoint)."""
    votes = (
        db.query(Vote)
        .filter(Vote.poll_id == poll_id)
        .order_by(Vote.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return {
        "poll_id": poll_id,
        "total": db.query(Vote).filter(Vote.poll_id == poll_id).count(),
        "votes": [
            {
                "id": v.id,
                "voter_hash": v.voter_hash,
                "vote_choice": v.vote_choice,
                "file_hash": v.file_hash,
                "created_at": v.created_at.isoformat(),
            }
            for v in votes
        ],
    }


# ─── Run ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
