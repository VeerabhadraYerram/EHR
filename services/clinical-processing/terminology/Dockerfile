FROM python:3.12-slim
WORKDIR /app

# Install ehr-contracts package
COPY packages/ehr-contracts /packages/ehr-contracts
RUN pip install --no-cache-dir /packages/ehr-contracts

# Install requirements
COPY services/clinical-processing/terminology/requirements.txt .
RUN grep -v "ehr-contracts" requirements.txt > reqs.txt && pip install --no-cache-dir -r reqs.txt

# Copy service code
COPY services/clinical-processing/terminology /app

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
