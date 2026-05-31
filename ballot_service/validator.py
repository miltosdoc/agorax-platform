"""
BallotValidator - Core validation logic for Gov.gr Solemn Declaration PDFs.

Implements 4 security gates:
1. Integrity (Anti-Forgery): Verify PAdES digital signature
2. Uniqueness (Anti-Spam): Check file hash for duplicates  
3. Context (Session Security): Verify poll token in text
4. Identity (One Person, One Vote): Hash AFM and check voter uniqueness
"""
import asyncio
import hashlib
import re
import io
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple, List
from datetime import datetime

from pypdf import PdfReader
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.settings import KeyUsageConstraints
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation.errors import SignatureValidationError
from sqlalchemy.orm import Session

from config import settings
from models import Vote


class RejectionReason(str, Enum):
    """Enumeration of all possible rejection reasons."""
    INVALID_SIGNATURE = "invalid_signature"
    UNKNOWN_SIGNER = "unknown_signer"
    NO_SIGNATURE = "no_signature"
    DUPLICATE_FILE = "duplicate_file"
    INVALID_TOKEN = "invalid_token"
    TOKEN_NOT_FOUND = "token_not_found"
    AFM_NOT_FOUND = "afm_not_found"
    ALREADY_VOTED = "already_voted"
    VOTE_CHOICE_NOT_FOUND = "vote_choice_not_found"
    PDF_READ_ERROR = "pdf_read_error"


@dataclass
class ValidationResult:
    """Result of ballot validation."""
    success: bool
    rejection_reason: Optional[RejectionReason] = None
    message: str = ""
    voter_hash: Optional[str] = None
    vote_choice: Optional[str] = None
    file_hash: Optional[str] = None
    signer_name: Optional[str] = None
    # Identity-verification extras (best-effort; non-fatal if absent).
    demographics: Optional[dict] = None
    doc_code_hash: Optional[str] = None


class BallotValidator:
    """
    Validates Gov.gr Solemn Declaration PDFs as certified ballots.
    
    Usage:
        validator = BallotValidator(db_session)
        result = validator.validate(pdf_bytes, poll_id, poll_token)
    """
    
    # Regex patterns for text extraction
    AFM_PATTERN = re.compile(r"(?:AFM|ΑΦΜ|Α\.Φ\.Μ\.|Tax ID)[:\s]*(\d{9})", re.IGNORECASE)
    # Markers that delimit the start of the declarant's free-form text in a
    # Gov.gr Solemn Declaration. Everything after one of these markers is
    # user-controlled and CANNOT be trusted to bind to the signer's identity,
    # because the citizen can type any AFM they want inside the declaration
    # body and the PAdES signature is from Gov.gr (the institutional signer),
    # not from a certificate that carries the citizen's AFM. Only header text
    # — the Gov.gr-populated identity block above one of these markers — is
    # used to extract the AFM that anchors `voter_hash`.
    DECLARATION_BODY_MARKERS = [
        re.compile(r"Με ατομική μου ευθύνη", re.IGNORECASE),
        re.compile(r"ΔΗΛΩΝΩ\s+ΟΤΙ", re.IGNORECASE),
        re.compile(r"Δηλώνω\s+ότι", re.IGNORECASE),
    ]
    VOTE_CHOICE_PATTERN = re.compile(r"vote for \[(.*?)\]", re.IGNORECASE)
    # Alternative Greek patterns - more flexible
    VOTE_CHOICE_PATTERN_GR = re.compile(r"ψηφίζω \[(.*?)\]", re.IGNORECASE)
    VOTE_CHOICE_PATTERN_GR_ALT = re.compile(r"ψηφίζω[\s:]+([^.\n]+)", re.IGNORECASE)  # More flexible Greek
    VOTE_CHOICE_PATTERN_GR_OTI = re.compile(r"ψηφίζω (?:για |υπέρ )?(.+?)(?:\.|$)", re.IGNORECASE)  # Even more flexible
    
    def __init__(self, db: Session):
        """Initialize validator with database session."""
        self.db = db
        self.allowed_signers = settings.ALLOWED_SIGNERS
        self.salt_key = settings.SALT_KEY
        self.allow_vote_update = settings.ALLOW_VOTE_UPDATE
    
    async def validate(self, pdf_bytes: bytes, poll_id: str, poll_token: str) -> ValidationResult:
        """
        Main validation method. Runs all 4 gates sequentially.
        
        Args:
            pdf_bytes: Raw bytes of the uploaded PDF file
            poll_id: Unique identifier for the poll/election
            poll_token: Session token that must appear in the PDF text
            
        Returns:
            ValidationResult with success status and details
        """
        # Gate 1: Integrity (Anti-Forgery)
        gate1_result = await self._gate1_verify_signature(pdf_bytes)
        if not gate1_result.success:
            return gate1_result
        
        # Gate 2: Uniqueness (Anti-Spam)
        file_hash = self._calculate_file_hash(pdf_bytes)
        gate2_result = self._gate2_check_uniqueness(file_hash)
        if not gate2_result.success:
            return gate2_result
        
        # Extract text for remaining gates
        try:
            text = self._extract_text(pdf_bytes)
        except Exception as e:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.PDF_READ_ERROR,
                message=f"Failed to extract text from PDF: {str(e)}"
            )
        
        # Gate 3: Context (Session Security)
        gate3_result = self._gate3_verify_token(text, poll_token)
        if not gate3_result.success:
            return gate3_result
        
        # Gate 4: Identity (One Person, One Vote)
        gate4_result = self._gate4_verify_identity(text, poll_id)
        if not gate4_result.success:
            return gate4_result
        
        # Extract vote choice
        vote_choice = self._extract_vote_choice(text)
        if not vote_choice:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.VOTE_CHOICE_NOT_FOUND,
                message="Could not find vote choice in declaration. Expected format: 'vote for [OPTION]'"
            )
        
        # All gates passed - record the vote
        voter_hash = gate4_result.voter_hash
        self._record_vote(
            poll_id=poll_id,
            voter_hash=voter_hash,
            file_hash=file_hash,
            vote_choice=vote_choice
        )
        
        return ValidationResult(
            success=True,
            message="Vote successfully recorded",
            voter_hash=voter_hash,
            vote_choice=vote_choice,
            file_hash=file_hash,
            signer_name=gate1_result.signer_name
        )

    async def validate_identity(self, pdf_bytes: bytes) -> ValidationResult:
        """
        Validate identity only (for one-time user verification).
        
        Checks:
        1. Valid Government Signature
        2. Extract valid AFM
        
        Does NOT check:
        - Poll token (allows any valid declaration)
        - Vote choice (not voting)
        - Uniqueness (allows checking identity multiple times if needed, though usually done once)
        """
        # Gate 1: Integrity (Anti-Forgery)
        gate1_result = await self._gate1_verify_signature(pdf_bytes)
        if not gate1_result.success:
            return gate1_result
            
        # Extract text
        try:
            text = self._extract_text(pdf_bytes)
        except Exception as e:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.PDF_READ_ERROR,
                message=f"Failed to extract text from PDF: {str(e)}"
            )
            
        # Extract AFM and hash it
        afm = self._extract_afm(text)
        if not afm:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.AFM_NOT_FOUND,
                message="Could not find AFM/Tax ID in the declaration"
            )
            
        voter_hash = self._hash_voter_id(afm)

        # Best-effort profile demographics + the per-document code. None of
        # these affect success — identity rests on the signature + AFM.
        demographics = self._extract_demographics(text)
        doc_code = self._extract_doc_code(text)
        doc_code_hash = self._hash_doc_code(doc_code) if doc_code else None

        return ValidationResult(
            success=True,
            message="Identity verified successfully",
            voter_hash=voter_hash,
            signer_name=gate1_result.signer_name,
            demographics=demographics,
            doc_code_hash=doc_code_hash,
        )
    
    async def _gate1_verify_signature(self, pdf_bytes: bytes) -> ValidationResult:
        """
        Gate 1: Verify the PDF has a valid PAdES digital signature from government.
        
        Uses pyhanko to validate cryptographic signatures and check the signer.
        """
        try:
            pdf_stream = io.BytesIO(pdf_bytes)
            # Use PyHanko's reader for signature validation
            reader = PdfFileReader(pdf_stream)
            
            # Check if document has any signatures
            sig_fields = reader.embedded_signatures
            if not sig_fields:
                return ValidationResult(
                    success=False,
                    rejection_reason=RejectionReason.NO_SIGNATURE,
                    message="PDF does not contain any digital signatures"
                )
            
            # Validate each signature
            valid_signer = None
            found_signers = []
            
            for sig in sig_fields:
                try:
                    # pyhanko's validate_pdf_signature drives its own asyncio
                    # internally — run it in a worker thread so it never
                    # collides with the server's running event loop.
                    status = await asyncio.to_thread(
                        validate_pdf_signature,
                        sig,
                        key_usage_settings=KeyUsageConstraints(
                            key_usage={'digital_signature', 'non_repudiation'},
                        ),
                    )
                    
                    # Check if signature is valid
                    if status.valid and status.intact:
                        # Extract signer name from certificate
                        signer_cert = status.signing_cert
                        if signer_cert:
                            # Get Common Name (CN) from certificate subject
                            signer_name = self._extract_signer_name(signer_cert)
                            found_signers.append(signer_name)
                            
                            # Check if signer is in allowed list
                            if self._is_allowed_signer(signer_name):
                                valid_signer = signer_name
                                break
                            
                except SignatureValidationError:
                    continue
            
            if valid_signer:
                return ValidationResult(
                    success=True,
                    message="Valid government signature verified",
                    signer_name=valid_signer
                )
            
            # No valid government signature found
            found_str = ", ".join(found_signers) if found_signers else "None"
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.UNKNOWN_SIGNER,
                message=f"PDF signature is not from a recognized government authority. Found: {found_str}"
            )
            
        except Exception as e:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.INVALID_SIGNATURE,
                message=f"Signature verification failed: {str(e)}"
            )
    
    def _extract_signer_name(self, cert) -> str:
        """Extract the Common Name (CN) from a certificate subject."""
        try:
            # Debug: Get the type and available attributes
            cert_type = type(cert).__name__
            
            # Try different approaches based on what the cert object might be
            
            # Approach 1: If it has human_friendly property (pyhanko style)
            if hasattr(cert, 'human_friendly'):
                return str(cert.human_friendly)
            
            # Approach 2: If it has a subject with human_friendly
            if hasattr(cert, 'subject'):
                subj = cert.subject
                if hasattr(subj, 'human_friendly'):
                    return str(subj.human_friendly)
                # Try str representation
                return f"Subject: {str(subj)}"
            
            # Approach 3: Try to get the underlying cryptography cert
            if hasattr(cert, 'public_bytes'):
                # It might be a cryptography cert
                from cryptography.x509.oid import NameOID
                for attr in cert.subject:
                    if attr.oid == NameOID.COMMON_NAME:
                        return attr.value
            
            # Approach 4: Just return string representation
            return f"CertType({cert_type}): {str(cert)[:200]}"
                
        except Exception as e:
            return f"CertError({type(cert).__name__}): {str(e)}"
    
    def _is_allowed_signer(self, signer_name: str) -> bool:
        """Check if the signer name matches any allowed government authority."""
        signer_upper = signer_name.upper()
        for allowed in self.allowed_signers:
            if allowed.upper() in signer_upper or signer_upper in allowed.upper():
                return True
        return False
    
    def _gate2_check_uniqueness(self, file_hash: str) -> ValidationResult:
        """
        Gate 2: Check if this exact file has been uploaded before.
        
        Prevents the same declaration from being used twice.
        """
        existing = self.db.query(Vote).filter(Vote.file_hash == file_hash).first()
        
        if existing:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.DUPLICATE_FILE,
                message="This declaration has already been submitted",
                file_hash=file_hash
            )
        
        return ValidationResult(
            success=True,
            message="File is unique",
            file_hash=file_hash
        )
    
    def _gate3_verify_token(self, text: str, poll_token: str) -> ValidationResult:
        """
        Gate 3: Verify the poll token appears in the declaration text.
        
        Ensures the declaration was created specifically for this voting session.
        NOTE: For testing/demo, this gate is relaxed. In production, require the token.
        """
        if not poll_token:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.INVALID_TOKEN,
                message="Poll token is required"
            )
        
        # For now, skip strict token validation if DEBUG is enabled
        # This allows testing with real Gov.gr documents that don't have our token
        if settings.DEBUG:
            return ValidationResult(
                success=True,
                message="Token check bypassed in debug mode"
            )
        
        if poll_token not in text:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.TOKEN_NOT_FOUND,
                message="Security token not found in declaration. Please generate a new declaration with the correct token."
            )
        
        return ValidationResult(
            success=True,
            message="Token verified"
        )
    
    def _gate4_verify_identity(self, text: str, poll_id: str) -> ValidationResult:
        """
        Gate 4: Extract AFM, hash it, and check if voter has already voted.
        
        Privacy is maintained by never storing the raw AFM.
        """
        # Extract AFM from text
        afm = self._extract_afm(text)
        if not afm:
            return ValidationResult(
                success=False,
                rejection_reason=RejectionReason.AFM_NOT_FOUND,
                message="Could not find AFM/Tax ID in the declaration"
            )
        
        # Hash AFM with salt for privacy
        voter_hash = self._hash_voter_id(afm)
        
        # Check if this voter has already voted in this poll
        existing_vote = self.db.query(Vote).filter(
            Vote.poll_id == poll_id,
            Vote.voter_hash == voter_hash
        ).first()
        
        if existing_vote:
            if self.allow_vote_update:
                # Delete existing vote to allow update
                self.db.delete(existing_vote)
                self.db.commit()
                return ValidationResult(
                    success=True,
                    message="Previous vote will be updated",
                    voter_hash=voter_hash
                )
            else:
                return ValidationResult(
                    success=False,
                    rejection_reason=RejectionReason.ALREADY_VOTED,
                    message="You have already voted in this poll",
                    voter_hash=voter_hash
                )
        
        return ValidationResult(
            success=True,
            message="Voter identity verified",
            voter_hash=voter_hash
        )
    
    def _calculate_file_hash(self, pdf_bytes: bytes) -> str:
        """Calculate SHA-256 hash of the entire file."""
        return hashlib.sha256(pdf_bytes).hexdigest()
    
    def _hash_voter_id(self, afm: str) -> str:
        """Hash AFM with salt for privacy-preserving voter identification."""
        combined = f"{afm}{self.salt_key}"
        return hashlib.sha256(combined.encode('utf-8')).hexdigest()
    
    def _extract_text(self, pdf_bytes: bytes) -> str:
        """Extract all text content from PDF."""
        pdf_stream = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_stream)
        
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        
        return "\n".join(text_parts)
    
    def _extract_afm(self, text: str) -> Optional[str]:
        """
        Extract the declarant's AFM from a Gov.gr Solemn Declaration.

        The PAdES signature on a Solemn Declaration is from Gov.gr, not from
        a certificate bound to the declarant — so the citizen's identity has
        to come from the document's auto-populated header fields. The body
        of the declaration is free text written by the citizen, and any AFM
        appearing there is untrusted: a citizen could type someone else's
        AFM into their own declaration and (depending on PDF text-extraction
        order) have it match before the header AFM, allowing them to claim
        another person's `voter_hash` slot.

        This implementation:
          1. Slices the text at the first declaration body marker
             ("Με ατομική μου ευθύνη", "ΔΗΛΩΝΩ ΟΤΙ", "Δηλώνω ότι") — those
             phrases are template-fixed in every Solemn Declaration.
          2. Searches for AFM matches only in the header (text before the
             marker).
          3. Requires every header match to agree. Conflicting AFMs in the
             header section indicate either template damage or tampering;
             refuse rather than guess.
          4. Returns None if no AFM is found in the header, if the body
             marker is missing entirely, or if header AFMs disagree.

        Callers must treat None as a verification failure (AFM_NOT_FOUND),
        never as "verified without an AFM".
        """
        # Locate the earliest body marker and discard everything from there
        # onwards. If no marker is present, the document does not look like
        # a Gov.gr Solemn Declaration — refuse rather than fall back to
        # whole-text search, which is the original exploitable path.
        body_start = None
        for marker in self.DECLARATION_BODY_MARKERS:
            m = marker.search(text)
            if m and (body_start is None or m.start() < body_start):
                body_start = m.start()
        if body_start is None:
            return None

        header = text[:body_start]
        matches = self.AFM_PATTERN.findall(header)
        if not matches:
            return None

        distinct = set(matches)
        if len(distinct) != 1:
            return None
        return matches[0]

    def _extract_demographics(self, text: str) -> dict:
        """
        Best-effort extraction of profile demographics from a Responsible
        Declaration. Non-fatal — any field that does not parse is omitted;
        identity verification does not depend on these.

        Stored: first/last name, date of birth, place of birth, residence
        municipality, postcode. NOT extracted: ID-card number, parents'
        names, phone, full street — deliberately, by data-minimisation.
        """
        flat = re.sub(r"\s+", " ", text)
        out: dict = {}

        def grab(pattern: str) -> Optional[str]:
            m = re.search(pattern, flat, re.IGNORECASE)
            return m.group(1).strip() if m else None

        # GDPR Art. 5(1)(c) minimisation: DOB and place-of-birth are
        # extracted from the PDF text in transit but deliberately NOT stored.
        # See migration 0014_minimise_personal_data.sql and
        # docs/compliance/02_DATA_MINIMIZATION_AUDIT.md.
        first = grab(r"Όνομα:\s*([^\s:]+)")
        if first:
            out["first_name"] = first
        last = grab(r"Επώνυμο:\s*([^\s:]+)")
        if last:
            out["last_name"] = last
        muni = grab(r"Κατοικίας:\s*(.+?)\s*(?:Οδός|Αριθ|ΤΚ|Τ\.Κ|ΑΦΜ)")
        if muni:
            out["municipality"] = muni
        postcode = grab(r"Τ\.?Κ\.?\s*:?\s*(\d{5})")
        if postcode:
            out["postcode"] = postcode
        return out

    def _extract_doc_code(self, text: str) -> Optional[str]:
        """Extract the Gov.gr per-document code (Κωδικός)."""
        match = re.search(r"Κωδικός:\s*([A-Za-z0-9_\-]{6,})", text)
        return match.group(1).strip() if match else None

    def _hash_doc_code(self, code: str) -> str:
        """Salted hash of the document code — a stable anti-replay key."""
        return hashlib.sha256(f"{code}{self.salt_key}".encode("utf-8")).hexdigest()
    
    def _extract_vote_choice(self, text: str) -> Optional[str]:
        """Extract vote choice from text using multiple regex patterns."""
        # Try English pattern first
        match = self.VOTE_CHOICE_PATTERN.search(text)
        if match:
            return match.group(1).strip()
        
        # Try Greek pattern with brackets
        match = self.VOTE_CHOICE_PATTERN_GR.search(text)
        if match:
            return match.group(1).strip()
        
        # Try more flexible Greek patterns
        match = self.VOTE_CHOICE_PATTERN_GR_ALT.search(text)
        if match:
            choice = match.group(1).strip()
            # Clean up common words that aren't the actual choice
            if choice and len(choice) < 200:  # Sanity check
                return choice
        
        # Try most flexible Greek pattern
        match = self.VOTE_CHOICE_PATTERN_GR_OTI.search(text)
        if match:
            choice = match.group(1).strip()
            if choice and len(choice) < 200:
                return choice
        
        return None
    
    def _record_vote(self, poll_id: str, voter_hash: str, file_hash: str, vote_choice: str) -> Vote:
        """Record the validated vote in the database."""
        vote = Vote(
            poll_id=poll_id,
            voter_hash=voter_hash,
            file_hash=file_hash,
            vote_choice=vote_choice,
            created_at=datetime.utcnow()
        )
        self.db.add(vote)
        self.db.commit()
        self.db.refresh(vote)
        return vote
