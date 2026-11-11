
resource "aws_sqs_queue" "upload_queue" {
  name                       = "image-upload-queue"
  visibility_timeout_seconds = 360

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_sqs_queue" "completion_queue" {
  name = "image-completion-queue"

  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_sqs_queue_policy" "upload_queue_policy" {
  queue_url = aws_sqs_queue.upload_queue.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Sid    = "AllowS3ToSendMessages"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }

        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.upload_queue.arn

        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.media_bucket.arn
          }

          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.media_bucket.id

  queue {
    queue_arn     = aws_sqs_queue.upload_queue.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
  }

  depends_on = [
    aws_sqs_queue_policy.upload_queue_policy
  ]
}
