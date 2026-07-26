#!/usr/bin/env python3
"""把本地 storage 目录的存量资产全量迁移到腾讯云 COS(保持相对路径为对象键)。

用法:
  python migrate-storage-to-cos.py --storage-dir ./storage \
      --bucket codress-1304754973 --region ap-hongkong \
      [--secret-id ... --secret-key ...]   # 缺省读环境变量 COS_SECRET_ID/COS_SECRET_KEY

幂等:同键且同大小的对象直接跳过;结束打印 uploaded/skipped/failed 汇总,失败非零退出。
"""
import argparse
import os
import sys

from qcloud_cos import CosConfig, CosS3Client

CONTENT_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
CACHE_CONTROL = "public, max-age=31536000, immutable"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--storage-dir", required=True)
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--region", required=True)
    ap.add_argument("--secret-id", default=os.environ.get("COS_SECRET_ID", ""))
    ap.add_argument("--secret-key", default=os.environ.get("COS_SECRET_KEY", ""))
    args = ap.parse_args()
    if not args.secret_id or not args.secret_key:
        sys.exit("missing COS_SECRET_ID / COS_SECRET_KEY")

    client = CosS3Client(CosConfig(
        Region=args.region, SecretId=args.secret_id, SecretKey=args.secret_key, Scheme="https",
    ))

    uploaded, skipped, failed = [], [], []
    root = os.path.abspath(args.storage_dir)
    for dirpath, _dirnames, filenames in os.walk(root):
        for filename in filenames:
            full = os.path.join(dirpath, filename)
            key = os.path.relpath(full, root).replace(os.sep, "/")
            ext = os.path.splitext(filename)[1].lower()
            if ext not in CONTENT_TYPES:
                print(f"skip(non-image): {key}")
                continue
            size = os.path.getsize(full)
            try:
                head = client.head_object(Bucket=args.bucket, Key=key)
                if int(head.get("Content-Length", -1)) == size:
                    skipped.append(key)
                    print(f"skip(exists): {key}")
                    continue
            except Exception:
                pass  # 不存在则上传
            try:
                with open(full, "rb") as f:
                    client.put_object(
                        Bucket=args.bucket, Key=key, Body=f,
                        ContentType=CONTENT_TYPES[ext], CacheControl=CACHE_CONTROL,
                    )
                uploaded.append(key)
                print(f"uploaded: {key} ({size} bytes)")
            except Exception as error:
                failed.append((key, str(error)))
                print(f"FAILED: {key}: {error}", file=sys.stderr)

    print(f"\nsummary: uploaded={len(uploaded)} skipped={len(skipped)} failed={len(failed)}")
    if failed:
        for key, error in failed:
            print(f"  failed: {key}: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
