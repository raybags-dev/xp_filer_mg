
# ==================================================
# Lambda IAM roles and permissions
# ==================================================
# Lambda execution role trust policy
data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
# ==================================================
# L2 - SQS Listener
# ==================================================

resource "aws_iam_role" "lambda_l2_role" {
  name               = "lambda-l2-sqs-listener-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}
resource "aws_iam_role_policy_attachment" "lambda_l2_basic" {
  role       = aws_iam_role.lambda_l2_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "l2_permissions" {
  name = "lambda-l2-pipeline-permissions"
  role = aws_iam_role.lambda_l2_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "ConsumeUploadQueue"
        Effect = "Allow"

        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]

        Resource = aws_sqs_queue.upload_queue.arn
      },
      {
        Sid      = "StartImagePipeline"
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = aws_sfn_state_machine.image_pipeline.arn
      }
    ]
  })
}
# ==================================================
# L3 - Image Validator
# ==================================================
resource "aws_iam_role" "lambda_l3_role" {
  name               = "lambda-l3-validator-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}
resource "aws_iam_role_policy_attachment" "lambda_l3_basic" {
  role       = aws_iam_role.lambda_l3_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "l3_permissions" {
  name = "lambda-l3-s3-read-permissions"
  role = aws_iam_role.lambda_l3_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid      = "ReadUploadedImages"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.media_bucket.arn}/uploads/*"
      }
    ]
  })
}
# ==================================================
# L4 - Image Processor
# ==================================================
resource "aws_iam_role" "lambda_l4_role" {
  name               = "lambda-l4-processor-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}
resource "aws_iam_role_policy_attachment" "lambda_l4_basic" {
  role       = aws_iam_role.lambda_l4_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_iam_role_policy" "l4_permissions" {
  name = "lambda-l4-image-processing-s3-permissions"
  role = aws_iam_role.lambda_l4_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid      = "ReadOriginalImages"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.media_bucket.arn}/uploads/*"
      },
      {
        Sid      = "WriteProcessedImages"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.media_bucket.arn}/processed/*"
      }
    ]
  })
}
# ==================================================
# L5 - Completion Finalizer
# ==================================================
resource "aws_iam_role" "lambda_l5_role" {
  name               = "lambda-l5-finalizer-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "lambda_l5_basic" {
  role       = aws_iam_role.lambda_l5_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "l5_permissions" {
  name = "lambda-l5-completion-queue-permissions"
  role = aws_iam_role.lambda_l5_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid      = "PublishCompletionMessages"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.completion_queue.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "l5_s3_permissions" {
  name = "lambda-l5-verify-processed-images-permissions"
  role = aws_iam_role.lambda_l5_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid      = "VerifyProcessedImages"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.media_bucket.arn}/processed/*"
      }
    ]
  })
}


# ==================================================
# AWS Step Functions IAM Role
# ==================================================
resource "aws_iam_role" "sfn_role" {
  name = "image-processing-step-functions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "states.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })
}

# ==================================================
# Step Functions Lambda Invocation Permissions
# ==================================================

resource "aws_iam_role_policy" "sfn_lambda_permissions" {
  name = "image-processing-lambda-invoke-permissions"
  role = aws_iam_role.sfn_role.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Action = [
          "lambda:InvokeFunction"
        ]

        Resource = [
          aws_lambda_function.l3_validator.arn,
          aws_lambda_function.l4_processor.arn,
          aws_lambda_function.l5_finalizer.arn
        ]
      }
    ]
  })
}
