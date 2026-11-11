#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUILD_DIR="$ROOT_DIR/build"
LAMBDA_DIR="$BUILD_DIR/lambda"
L4_DIR="$LAMBDA_DIR/l4-package"

CREATED_FILES=()
CREATED_DIRS=()
GENERATED_ZIPS=()

cleanup() {
  echo
  echo "========== CLEANUP TEMPORARY FILES =========="

  for file in "${CREATED_FILES[@]}"; do
    rm -f "$file"
  done

  for file in "${GENERATED_ZIPS[@]}"; do
    rm -f "$file"
  done

  for ((i=${#CREATED_DIRS[@]}-1; i>=0; i--)); do
    rmdir "${CREATED_DIRS[$i]}" 2>/dev/null || true
  done

  echo "Temporary destroy artifacts removed."
}

trap cleanup EXIT

echo "========== LOAD ENVIRONMENT =========="

if [[ ! -f .env ]]; then
  echo "ERROR: .env file not found."
  exit 1
fi

set -a
source .env
set +a

AWS_REGION="${AWS_REGION:-eu-central-1}"
BUDGET_LIMIT="${BUDGET_LIMIT:-20}"

if [[ -z "${ALERT_EMAIL:-}" ]]; then
  echo "ERROR: ALERT_EMAIL is missing from .env."
  exit 1
fi

if [[ -z "${AWS_BUCKET_NAME:-}" ]]; then
  echo "ERROR: AWS_BUCKET_NAME is missing from .env."
  exit 1
fi

TF_VARS=(
  "-var=aws_region=${AWS_REGION}"
  "-var=bucket_name=${AWS_BUCKET_NAME}"
  "-var=budget_limit=${BUDGET_LIMIT}"
  "-var=alert_email=${ALERT_EMAIL}"
)

echo "========== CONFIRM DESTRUCTION =========="

echo "WARNING: This will destroy all Terraform-managed infrastructure."
echo "S3 buckets have force_destroy enabled."
echo "Original images, processed images and logs may be permanently deleted."

read -r -p "Type DESTROY to continue: " CONFIRMATION

if [[ "$CONFIRMATION" != "DESTROY" ]]; then
  echo "Destroy cancelled."
  exit 0
fi

echo
echo "========== PREPARE TEMPORARY ARCHIVE SOURCES =========="

create_dir_if_missing() {
  local dir="$1"

  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir"
    CREATED_DIRS+=("$dir")
  fi
}

create_placeholder_if_missing() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    printf '// Temporary placeholder used only for Terraform destruction.\n' > "$file"
    CREATED_FILES+=("$file")
  fi
}

create_dir_if_missing "$BUILD_DIR"
create_dir_if_missing "$LAMBDA_DIR"
create_dir_if_missing "$L4_DIR"

create_placeholder_if_missing "$LAMBDA_DIR/l2_sqsListner.js"
create_placeholder_if_missing "$LAMBDA_DIR/l3_validator.js"
create_placeholder_if_missing "$LAMBDA_DIR/l5_finalizer.js"

if [[ -z "$(find "$L4_DIR" -type f -print -quit)" ]]; then
  create_placeholder_if_missing "$L4_DIR/.destroy-placeholder.js"
fi

echo "Temporary archive sources prepared."

echo
echo "========== PREPARE ARCHIVE OUTPUTS =========="

ARCHIVE_OUTPUTS=(
  "$LAMBDA_DIR/l2_sqsListner.zip"
  "$LAMBDA_DIR/l3_validator.zip"
  "$LAMBDA_DIR/l4_processor.zip"
  "$LAMBDA_DIR/l5_finalizer.zip"
)

for archive in "${ARCHIVE_OUTPUTS[@]}"; do
  if [[ ! -e "$archive" ]]; then
    GENERATED_ZIPS+=("$archive")
  fi
done

echo "Archive output paths prepared."

echo
echo "========== TERRAFORM DESTROY =========="

terraform -chdir=terraform destroy "${TF_VARS[@]}"

echo
echo "========== DESTROY COMPLETE =========="
