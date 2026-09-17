import os
import io
import json
import hashlib
from typing import Tuple, Dict, Any, Optional
from minio import Minio
from minio.error import S3Error

class MinIOStorage:
    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        secure: bool = False
    ):
        self.endpoint = endpoint or os.getenv("MINIO_ENDPOINT", "localhost:9000")
        self.access_key = access_key or os.getenv("MINIO_ROOT_USER", os.getenv("MINIO_ACCESS_KEY", "minioadmin"))
        self.secret_key = secret_key or os.getenv("MINIO_ROOT_PASSWORD", os.getenv("MINIO_SECRET_KEY", "minioadmin"))
        self.bucket_name = bucket_name or os.getenv("MINIO_BUCKET_NAME", "ehr-raw-inputs")
        self.secure = secure
        
        self.client = None
        self._init_client()

    def _init_client(self):
        try:
            self.client = Minio(
                endpoint=self.endpoint,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure
            )
            # Ensure bucket exists
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
        except Exception as e:
            # Fallback to local file caching if MinIO is not directly reachable
            print(f"[MinIO Storage Warning] Could not connect to MinIO ({e}). Will use local storage fallback.")
            self.client = None

    def store_raw_payload(self, source_type: str, doc_id: str, payload: Dict[str, Any]) -> Tuple[str, str]:
        """
        Stores immutable raw payload in MinIO and calculates its SHA-256 checksum.
        Returns: (minio_path, sha256_checksum)
        """
        payload_bytes = json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")
        sha256 = hashlib.sha256(payload_bytes).hexdigest()
        
        category = source_type.lower().replace("_", "-")
        object_name = f"{category}/{doc_id}.json"
        
        if self.client:
            try:
                data_stream = io.BytesIO(payload_bytes)
                self.client.put_object(
                    bucket_name=self.bucket_name,
                    object_name=object_name,
                    data=data_stream,
                    length=len(payload_bytes),
                    content_type="application/json",
                    metadata={"sha256": sha256, "source_type": source_type, "doc_id": doc_id}
                )
                minio_uri = f"{self.bucket_name}/{object_name}"
                return minio_uri, sha256
            except Exception as e:
                print(f"[MinIO Storage Error] Failed to upload object {object_name}: {e}")
        
        # Local fallback
        fallback_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "minio_cache", category)
        os.makedirs(fallback_dir, exist_ok=True)
        fallback_path = os.path.join(fallback_dir, f"{doc_id}.json")
        with open(fallback_path, "wb") as f:
            f.write(payload_bytes)
        
        return f"{self.bucket_name}/{object_name}", sha256

    def get_raw_payload(self, minio_path: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves raw payload from MinIO (or fallback).
        """
        parts = minio_path.split("/", 1)
        if len(parts) == 2:
            bucket, obj_name = parts
        else:
            bucket = self.bucket_name
            obj_name = minio_path

        if self.client:
            try:
                response = self.client.get_object(bucket, obj_name)
                data = response.read()
                response.close()
                response.release_conn()
                return json.loads(data.decode("utf-8"))
            except Exception as e:
                print(f"[MinIO Storage Error] Failed to retrieve object {minio_path}: {e}")

        # Try fallback
        fallback_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "minio_cache", obj_name)
        if os.path.exists(fallback_path):
            with open(fallback_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return None

# Singleton instance
storage_client = MinIOStorage()
