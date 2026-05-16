/**
 * Ballot Client — HTTP client for the Python Ballot Validation Service.
 *
 * Proxies requests from the main Node.js API to the ballot-service container.
 * The ballot service runs on port 8000 and handles PDF validation.
 */

import fetch from "node-fetch";
import FormData from "form-data";

// Ballot service URL — Docker internal network
const BALLOT_SERVICE_URL = process.env.BALLOT_SERVICE_URL || "http://localhost:8000";

export interface BallotValidationResult {
  success: boolean;
  message: string;
  voter_hash?: string;
  vote_choice?: string;
  file_hash?: string;
  signer_name?: string;
  rejection_reason?: string;
}

export interface IdentityValidationResult {
  success: boolean;
  message: string;
  voter_hash?: string;
  signer_name?: string;
  rejection_reason?: string;
  /** Best-effort verified demographics from the declaration. */
  demographics?: {
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    place_of_birth?: string;
    municipality?: string;
    postcode?: string;
  };
  /** Salted hash of the Gov.gr per-document code — an anti-replay key. */
  doc_code_hash?: string;
}

export interface PollStats {
  poll_id: string;
  total_votes: number;
  unique_voters: number;
  choices: Record<string, number>;
}

/**
 * Generate a poll token for ballot voting.
 *
 * The token is a random string that must appear in the Solemn Declaration PDF
 * to prove the declaration was created specifically for this voting session.
 */
export function generatePollToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Get ballot voting instructions for a poll.
 *
 * Returns instructions on how to create a Solemn Declaration PDF with the
 * correct poll token embedded.
 */
export function getBallotInstructions(pollId: string, pollToken: string): string {
  return `
Ballot Voting Instructions for Poll: ${pollId}

To cast your vote, you need to create a Solemn Declaration PDF through Gov.gr
that includes the following security token:

  Security Token: ${pollToken}

Steps:
1. Log in to Gov.gr with your Taxisnet credentials
2. Create a new Solemn Declaration (Δήλωση υπό Δικαιο-swορκία)
3. Include your AFM (Tax ID) in the declaration
4. Include the security token above in the declaration text
5. State your vote choice using the format: "vote for [OPTION]" or "ψηφίζω [ΕΠΙΛΟΓΗ]"
6. Sign the PDF digitally with your Taxisnet certificate
7. Upload the signed PDF to the ballot validation endpoint

Your vote will be validated through 4 security gates:
1. PAdES digital signature verification (anti-forgery)
2. File uniqueness check (anti-spam)
3. Poll token verification (session security)
4. Voter identity check (one person, one vote)

Your AFM is hashed with a salt — we never store your raw Tax ID.
  `.trim();
}

/**
 * Validate a ballot PDF by sending it to the ballot validation service.
 */
export async function validateBallot(
  pdfBuffer: Buffer,
  pollId: string,
  pollToken: string,
): Promise<BallotValidationResult> {
  const form = new FormData();
  form.append("file", pdfBuffer, { filename: "declaration.pdf" });
  form.append("poll_id", pollId);
  form.append("poll_token", pollToken);

  try {
    const response = await fetch(`${BALLOT_SERVICE_URL}/api/ballot/validate`, {
      method: "POST",
      body: form as any,
      headers: form.getHeaders(),
    });

    const data = await response.json() as BallotValidationResult;

    if (!response.ok) {
      return {
        success: false,
        message: (data as any).detail || `Validation failed: ${response.status}`,
        rejection_reason: (data as any).rejection_reason,
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: "Ballot validation service unavailable",
    };
  }
}

/**
 * Verify identity only (no voting) — for one-time user verification.
 */
export async function verifyIdentity(
  pdfBuffer: Buffer,
): Promise<IdentityValidationResult> {
  const form = new FormData();
  form.append("file", pdfBuffer, { filename: "declaration.pdf" });

  try {
    const response = await fetch(`${BALLOT_SERVICE_URL}/api/ballot/validate-identity`, {
      method: "POST",
      body: form as any,
      headers: form.getHeaders(),
    });

    const data = await response.json() as IdentityValidationResult;

    if (!response.ok) {
      return {
        success: false,
        // The validator returns {message,...}; HTTPException returns {detail}.
        message:
          (data as any).message ||
          (data as any).detail ||
          `Identity verification failed: ${response.status}`,
        rejection_reason: (data as any).rejection_reason,
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: "Ballot validation service unavailable",
    };
  }
}

/**
 * Get voting statistics for a poll.
 */
export async function getBallotStats(pollId: string): Promise<PollStats> {
  try {
    const response = await fetch(`${BALLOT_SERVICE_URL}/api/ballot/poll/${pollId}/stats`);
    const data = await response.json() as PollStats;

    if (!response.ok) {
      return {
        poll_id: pollId,
        total_votes: 0,
        unique_voters: 0,
        choices: {},
      };
    }

    return data;
  } catch (error) {
    return {
      poll_id: pollId,
      total_votes: 0,
      unique_voters: 0,
      choices: {},
    };
  }
}

/**
 * Check if the ballot validation service is healthy.
 */
export async function checkBallotServiceHealth(): Promise<{
  status: string;
  database: string;
  service: string;
}> {
  try {
    const response = await fetch(`${BALLOT_SERVICE_URL}/api/health`);
    const data = await response.json() as { status: string; database: string; service: string };

    if (!response.ok) {
      return {
        status: "unhealthy",
        database: "unknown",
        service: "ballot-validator",
      };
    }

    return data;
  } catch (error) {
    return {
      status: "unavailable",
      database: "unreachable",
      service: "ballot-validator",
    };
  }
}


/**
 * Upload and validate a ballot PDF document.
 * @param pdfBuffer - Raw PDF buffer
 * @param userId - User ID uploading the ballot
 * @returns Validation result with hash and status
 */
export async function ballotUpload(
  pdfBuffer: Buffer,
  userId: string
): Promise<{ hash: string; valid: boolean; error?: string }> {
  // Placeholder - actual implementation calls external ballot service
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  return { hash, valid: true };
}
