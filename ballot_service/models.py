"""
Database models for the Ballot Validation Service.
SQLAlchemy ORM models for storing votes.
"""
from sqlalchemy import Column, String, Integer, DateTime, Index, func
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class Vote(Base):
    """
    Represents a validated vote from a Gov.gr Solemn Declaration.
    
    Attributes:
        id: Primary key
        poll_id: Identifier for the poll/election (e.g., "election_2024")
        voter_hash: SHA256(AFM + SALT) - hashed voter identity, never raw AFM
        file_hash: SHA256 of the entire PDF file bytes (unique constraint)
        vote_choice: The extracted vote option from the declaration text
        created_at: Timestamp when the vote was recorded
    """
    __tablename__ = "votes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    poll_id = Column(String(255), nullable=False, index=True)
    voter_hash = Column(String(64), nullable=False, index=True)  # SHA256 = 64 hex chars
    file_hash = Column(String(64), nullable=False, unique=True)  # SHA256 = 64 hex chars
    vote_choice = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Composite index for efficient lookup: has this voter voted in this poll?
    __table_args__ = (
        Index('ix_votes_poll_voter', 'poll_id', 'voter_hash'),
    )
    
    def __repr__(self) -> str:
        return f"<Vote(id={self.id}, poll_id='{self.poll_id}', choice='{self.vote_choice}')>"
