FROM python:3.12-slim

# System dependencies for scientific computing (OpenMP for XGBoost/SHAP)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY . .

EXPOSE 8004

# Run FastAPI microservice
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
