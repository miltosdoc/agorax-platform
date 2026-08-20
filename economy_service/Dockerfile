FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends     gcc     libpq-dev     && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY economy_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY economy_service/ .

# Copy sibling agorax_economy module
COPY agorax_economy /app/agorax_economy

# Run as non-root user
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3     CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')"

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
