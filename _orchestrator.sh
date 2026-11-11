
#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

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

echo "========== BUILD TYPESCRIPT =========="

npm run build


echo "========== PACKAGE LAMBDA HANDLERS =========="

mkdir -p build/lambda

# L2 - SQS Listener
npx esbuild src/handlers/l2_sqsListner.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=build/lambda/l2_sqsListner.js

# L3 - Image Validator
npx esbuild src/handlers/l3_validator.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=build/lambda/l3_validator.js

# L4 - Image Processor
# Sharp is external because it contains native binaries.
L4_PACKAGE_DIR="$ROOT_DIR/build/lambda/l4-package"

rm -rf "$L4_PACKAGE_DIR"
mkdir -p "$L4_PACKAGE_DIR"

npx esbuild src/handlers/l4_processor.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --external:sharp \
  --outfile="$L4_PACKAGE_DIR/l4_processor.js"

echo "========== INSTALL SHARP LAMBDA DEPENDENCIES =========="

npm install \
  --prefix "$L4_PACKAGE_DIR" \
  --omit=dev \
  --no-save \
  --no-package-lock \
  --os=linux \
  --cpu=x64 \
  sharp@0.35.5

echo "========== VERIFY SHARP PACKAGE =========="

node - "$L4_PACKAGE_DIR" <<'NODE'
const path = require("node:path");

const packageDirectory = process.argv[2];
const sharpPath = path.join(packageDirectory, "node_modules", "sharp");

const sharp = require(sharpPath);

(async () => {
  const result = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: "#ffffff",
    },
  })
    .webp()
    .toBuffer();

  if (result.length === 0) {
    throw new Error("Sharp generated an empty image");
  }

  console.log("Sharp package verification successful");
  console.log(`Generated WebP: ${result.length} bytes`);
})().catch((error) => {
  console.error("Sharp package verification failed:", error);
  process.exit(1);
});
NODE

# L5 - Completion Finalizer
npx esbuild src/handlers/l5_finalizer.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile=build/lambda/l5_finalizer.js


echo "========== INITIALIZE TERRAFORM =========="

terraform -chdir=terraform init

echo "========== FORMAT TERRAFORM =========="

terraform -chdir=terraform fmt -recursive

echo "========== VALIDATE TERRAFORM =========="

terraform -chdir=terraform validate

TF_VARS=(
  "-var=aws_region=${AWS_REGION}"
  "-var=bucket_name=${AWS_BUCKET_NAME}"
  "-var=budget_limit=${BUDGET_LIMIT}"
  "-var=alert_email=${ALERT_EMAIL}"
)

echo "========== GENERATE TERRAFORM PLAN =========="

terraform -chdir=terraform plan "${TF_VARS[@]}" -out=tfplan

echo ""
read -r -p "Apply this Terraform plan? [y/N] " CONFIRMATION

if [[ "$CONFIRMATION" != "y" && "$CONFIRMATION" != "Y" ]]; then
  echo "Deployment cancelled. Terraform state and AWS resources were not intentionally changed."
  exit 0
fi

echo "========== APPLY TERRAFORM =========="

terraform -chdir=terraform apply tfplan

echo "========== DEPLOYMENT COMPLETE =========="

terraform -chdir=terraform output
