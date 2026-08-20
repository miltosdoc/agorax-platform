# Gov.gr Ballot Box Service

A secure Python backend for verifying government-issued Solemn Declaration PDFs as certified ballots.

## Quick Start

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env
# Edit .env with your production SALT_KEY

# Run the service
uvicorn main:app --reload --port 8001
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ballot/health` | Health check |
| POST | `/api/ballot/token` | Generate poll session token |
| GET | `/api/ballot/instructions` | Get voting instructions for frontend |
| POST | `/api/ballot/validate` | Validate and count a ballot PDF |
| GET | `/api/ballot/stats` | Get poll voting statistics |

## Security Gates

Each uploaded PDF goes through 4 security gates:

1. **Integrity (Anti-Forgery)**: Verify PAdES digital signature from Greek government
2. **Uniqueness (Anti-Spam)**: SHA-256 file hash prevents duplicate submissions
3. **Context (Session Security)**: Poll token must appear in declaration text
4. **Identity (One Person, One Vote)**: Hashed AFM ensures one vote per person

## Testing

```bash
# Run unit tests
python -m pytest tests/ -v
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SALT_KEY` | Secret key for voter hashing | (required in production) |
| `DATABASE_URL` | Database connection string | `sqlite:///./ballot_votes.db` |
| `DEBUG` | Enable debug mode | `false` |
| `ALLOW_VOTE_UPDATE` | Allow voters to change vote | `false` |
