FROM chromadb/chroma:0.5.23
ENV IS_PERSISTENT=1
ENV ANONYMIZED_TELEMETRY=False
EXPOSE 8000
CMD ["uvicorn", "chromadb.app:app", "--host", "0.0.0.0", "--port", "8000"]
